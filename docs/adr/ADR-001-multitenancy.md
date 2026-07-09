# ADR-001 — Multi-Tenant Mimari Seçimi

**Durum:** ✅ Kabul Edildi
**Tarih:** 2026-07-02
**Yazar:** Coder (Faz 0 üreticisi)
**Karar verici:** Mimari Komite (Faz 1 öncesi gözden geçirme)

---

## 1. Bağlam (Context)

Türkçe e-ticaret SaaS platformumuz; birden fazla firmaya satılabilecek, tema seçilebilen, B2C ve B2B destekli, Türkiye merkezli fakat uluslararası pazara açılabilecek bir platform olacaktır.

### 1.1. Teknik Yığın
- Monorepo: Turborepo + pnpm
- E-ticaret backend: **Medusa** (TypeScript, MikroORM + Knex, çekirdek modüller: Product, Pricing, Inventory, Order, Cart, Customer, Region, Sales Channel)
- SaaS kontrol backend: NestJS (TypeScript strict)
- Storefront: Next.js App Router
- Yönetim panelleri: Next.js
- Veritabanı: PostgreSQL
- Cache/Kuyruk: Redis
- Dosya: Cloudflare R2 / S3
- Türkiye ödeme adaptörleri: iyzico, PayTR, Param
- Deployment: Docker + Coolify

### 1.2. Kısıtlar ve Beklentiler
- **KVKK uyumu:** Kişisel veriler loglanmamalı, hassas alanlar maskelenmeli.
- **Veri izolasyonu:** Tenant A'nın müşterisi hiçbir yöntemle Tenant B'nin verisini görememeli.
- **Farklı ödeme sağlayıcı anahtarları:** Tenant A iyzico, Tenant B PayTR kullanabilir; aynı platform içinde.
- **Farklı tema / domain:** Tenant A `firma-a.com`, Tenant B `firma-b.net` adresinden servis alabilmeli.
- **Yetkilendirme izolasyonu:** Bir tenant yöneticisi diğer tenant'ın sipariş ID'sini tahmin edip erişememeli.
- **Çapraz tenant raporlama:** Platform sahibi (super-admin) tüm tenant'ları görebilmeli.
- **Başlangıç ölçeği:** 1–100 tenant (Türkiye KOBİ segmenti), yıllık büyüme payı.

### 1.3. Çözülmesi Gereken Mimari Problem
Birden çok firmanın aynı uygulamayı "kiralaması" için iki ana yaklaşımdan hangisinin benimseneceği:

- **Seçenek A** — Tek uygulama, tek veritabanı, tablolarda `tenant_id` + Postgre RLS.
- **Seçenek B** — Ortak kontrol paneli (NestJS) + tenant başına ayrı Postgre veritabanı (veya schema) + aynı uygulama imajı, otomatik provisionlama ile.

---

## 2. Karar (Decision)

**Seçenek B benimsenmiştir:** Ortak kontrol paneli (NestJS) tüm tenant'lara hizmet verir; her tenant'ın kendi Medusa instance'ı, kendi Postgre veritabanı, kendi ödeme sağlayıcı anahtarları, kendi dosya bucket'ı bulunur. Aynı Medusa imajı şablon olarak kullanılır; her tenant için `provision-tenant` scripti ile idempotent biçimde instance ayağa kaldırılır.

Karar; veri izolasyonu, provider izolasyonu, KVKK uyumu, framework yükseltme güvenliği ve Türkiye KOBİ segmentinin ölçeği dikkate alınarak verilmiştir.

---

## 3. Gerekçe (Rationale)

Bu kararı destekleyen başlıca nedenler:

### 3.1. Veri İzolasyonu Doğal ve Sıfır Hata Payı
A modelinde RLS doğru yapılandırılmazsa veya framework patch'i güncellemede kırılırsa **tüm tenant'ların verisi açık** kalır. B modelinde tenant başına ayrı Postgre veritabanı; fiziksel ayrım sağlar, yanlışlıkla cross-tenant sorgu yazılması imkânsızlaşır.

### 3.2. Provider Konfigürasyonu İzolasyonu (Belirleyici Faktör)
Medusa, provider'ları (`sendgrid.setApiKey`, ödeme provider'ları, dosya provider'ları) uygulama başlangıcında **singleton** olarak kurar. Aynı process'te iki farklı tenant için iki farklı iyzico API anahtarı çalıştırmak, Medusa'nın mevcut yaşam döngüsünde **mümkün değildir**. B modeli ile her tenant kendi Medusa process'inde kendi provider'larını yükler; bu kısıt mimari seviyede değil, doğal yaşam döngüsünde çözülür.

Detaylı bilgi: `docs/research/medusa-multitenancy-research.md`.

### 3.3. KVKK ve Uluslararası Yayılım
B modeli, bir tenant'ın AB bölgesinde (Frankfurt), bir diğerinin Türkiye'de (İstanbul) barındırılmasına izin verir. A modeli tek veritabanı ile bunu zorlaştırır.

### 3.4. Framework Yükseltme Güvenliği
Medusa sık sürüm güncellemesi alır. A modelinde patch'ler her yükseltmede yeniden test edilmelidir; bir bug tüm tenant'ları etkiler. B modelinde yükseltme tenant başına kademeli uygulanabilir; bir tenant'ta problem yaşanırsa yalnızca o etkilenir.

### 3.5. Operasyonel Yük Kabul Edilebilir Ölçekte
1–100 tenant aralığında, her tenant için ayrı Postgre process'i Coolify üzerinde standart bir compose stack'i olarak yönetilebilir. Provision scripti idempotent tasarlanmıştır; yeni tenant ekleme birkaç saniye sürer. 100+ tenant ölçeğine gelindiğinde mimari gözden geçirilebilir (olası geçiş: tenant başına DB → tenant başına cluster).

### 3.6. Kontrol Katmanı ve Süper Admin Görünürlüğü
NestJS ile yazılan kontrol paneli, tüm tenant'lara yönelik metrikleri (MRR, MAU, lisans durumu, ödeme sağlayıcı health) toplar. Bu, A modelinde RLS üzerinde super-admin bypass'ı ile yapılabilirdi ama audit trail'i zayıf kalırdı.

### 3.7. Medusa'nın Multi-Store ≠ Multi-Tenant Gerçeği
Medusa'da "Store" modülü **tek şirketin birden çok markası** içindir. **Farklı şirketlerin** izolasyonu için Store modülü güvenli bir zemin değildir. Bu durum B modelini fiilen zorunlu kılar.

---

## 4. Değerlendirilen Alternatifler (Considered Alternatives)

### 4.1. Seçenek A — Tek uygulama + ortak veritabanı + RLS
**Özet:** Tüm tenant'lar tek bir Medusa instance'ında, tek bir Postgre veritabanında. Her tenant-scoped tabloda `tenant_id` kolonu; her sorguda `tenant_id` filtresi (ORM + RLS); framework patch'i ile bağlantı başına `SET LOCAL app.current_tenant`.

**Artıları:**
- Operasyonel sadelik (tek DB, tek process).
- Kaynak verimliliği.
- Çapraz tenant raporlama kolaylığı (super-admin rolü için tek sorgu).
- Tek bir yerde yedekleme.

**Eksileri:**
- Provider izolasyonu çözülemez (SendGrid, iyzico, PayTR, Param, S3/R2 singleton kısıtı).
- Framework upgrade her seferinde patch testi gerektirir.
- ORM bypass eden raw Knex yolları (pricing, inventory, RBAC) yalnızca RLS ile korunur; patch hatası tüm tenant'ları açar.
- Zamanlanmış işlerde provider seçimi için ek bağlam katmanı gerekir.
- Veri konumu (KVKK, GDPR) tek bölgeyle sınırlı kalır.
- `customer.email` global tekil kısıtı kırılmalıdır.

**Neden elendi:** Provider izolasyonu ve framework yükseltme güvenliği bizim ölçeğimizde kabul edilemez bir teknik borç yaratır.

### 4.2. Seçenek B (BENİMSENEN) — Ortak kontrol paneli + tenant başına izole mağaza
**Özet:** NestJS kontrol paneli tüm tenant'ları yönetir. Her tenant'ın kendi Postgre veritabanı, kendi Medusa instance'ı (aynı Docker imajı), kendi ödeme sağlayıcı anahtarları, kendi dosya bucket'ı bulunur. `provision-tenant` scripti her şeyi idempotent biçimde kurar.

**Artıları:**
- Tam veri izolasyonu (fiziksel ayrım).
- Tam provider izolasyonu.
- Tam plugin izolasyonu.
- Framework yükseltmeleri tenant başına kademeli.
- Veri konumu serbest (her tenant kendi bölgesinde).
- Saldırı yüzeyi dar (cross-tenant sızıntı ancak kontrol panelinde olur).

**Eksileri:**
- Kaynak kullanımı daha yüksek (N × Postgre process).
- Provision otomasyonu zorunludur (Coldify stack'i idareten yönetilmeli).
- Migration her tenant için ayrı ayrı uygulanır.
- Çapraz tenant raporlama özel servis gerektirir (kontrol paneli topoloji bilgisi ile).
- Tenant başına deployment: 100+ tenant için alternatif (multi-cluster) düşünülmelidir.

**Neden seçildi:** Eksiler, bizim ölçeğimiz (1–100 tenant) için kabul edilebilir; artılar ise vazgeçilmezdir.

### 4.3. Hibrit — A ile başla, B'ye geçiş planı ile
Kısa vadede A, 30+ tenant'tan sonra B'ye geçiş. **Elendi**, çünkü A'dan B'ye geçiş veri taşıma maliyeti çok yüksek; baştan doğru yapmak stratejik olarak daha sağlıklı.

### 4.4. Medusa-extender / Topluluk Çözümleri
`medusa-extender`'ın multi-tenant modülü gibi topluluk eklentileri var. **Elendi**, çünkü kritik sağlayıcı izolasyonunu yine çözemiyor; ayrıca bakım/devam riski taşıyor (tek kişi/ekip tarafından sürdürülen repo).

---

## 5. Sonuçlar (Consequences)

### 5.1. Olumlu Sonuçlar
- **Veri sızıntısı riski en düşük seviyede.** Yanlış yapılandırılmış RLS veya framework patch'i yüzünden tüm tenant'ların verisi sızdırılmaz.
- **Her tenant kendi ödeme sağlayıcı entegrasyonunu seçebilir.** iyzico, PayTR, Param — her biri kendi anahtarı ile çalışır.
- **KVKK ve GDPR uyumlu veri konumu.** Bir tenant AB, bir diğeri TR konumunda çalışabilir.
- **Tema ve domain tamamen serbest.** Her tenant kendi altyapısında farklı Next.js storefront teması çalıştırır.
- **Süper admin görünürlüğü net.** NestJS kontrol paneli tek doğruluk kaynağıdır.
- **Framework yükseltmeleri güvenli.** Tenant başına kademeli geçiş, rollback kolaylığı.

### 5.2. Olumsuz Sonuçlar ve Kabul Edilen Bedeller
- **Kaynak kullanımı N×.** N tenant için ~N × 256MB RAM + 1 vCPU per Medusa process. 100 tenant için ~25GB RAM; Coolify üzerinde kontrol edilebilir.
- **Migration her tenant için ayrı uygulanır.** Migration aracı, `tenant_registry` tablosundaki her tenant için sırayla çalışır. CI/CD pipeline'ında bu açıkça modellenmeli.
- **Çapraz tenant raporlama için özel servis gerekir.** NestJS `metrics-collector` modülü her tenant Medusa'sından periyodik metrik toplar.
- **Provision hataları geri alınabilir olmalı.** Provision scripti her adımda `IF NOT EXISTS` ve transaction prensibi ile çalışır; başarısız adımda kısmi state bırakmaz.
- **100+ tenant için mimari gözden geçirme.** Yatay ölçeklendirme (Paylaşımlı DB + okuma replikası) bu noktada düşünülmeli.

---

## 6. Riskler ve Azaltma Stratejileri

| # | Risk | Olasılık | Etki | Azaltma Stratejisi |
|---|---|---|---|---|
| R1 | Provision scripti yarıda kalır, kısmi state oluşur | Orta | Yüksek | Tüm adımlar transaction içinde sarmalanır; her CREATE / ALTER için `IF NOT EXISTS` kullanılır. Provision idempotent ve gözlemlenebilir (her adım loglanır). |
| R2 | Domain taklidi ile tenant bağlamı değiştirilir | Yüksek | Kritik | `tenant-resolver` yalnızca güvenilir sunucu tarafı domain tablosunu okur. Host header **asla** kullanıcı girdisinden güvenli olmayan bir değişkene yazılmaz. Tenant bilgisi her zaman session'dan türetilir. |
| R3 | Bir tenant'ın verisi diğerine sızar | Düşük | Kritik | Fiziksel ayrım. İzole Postgre `pg_hba` + ayrı schema. NestJS tarafında `tenant.id` her sorguda zorunlu filtre olarak enjekte edilir. PoC aşamasında izolasyon testleri bunu kanıtlar. |
| R4 | Bir tenant'ın Medusa instance'ı çöker, müşteri etkilenir | Orta | Orta | Coolify tarafında healthcheck + otomatik restart; her tenant için ayrı log havuzu; alarm mekanizması. |
| R5 | Framework upgrade bir tenant'ta hata verir | Orta | Orta | Canary modeli: yeni sürüm önce 1 tenant'ta pilot edilir; 7 gün stabil ise diğerlerine kademeli yayılır. Patch yok. |
| R6 | Provider anahtar sızıntısı (iyzico secret) | Düşük | Yüksek | Provider anahtarları her tenant'ın `.env` dosyasında; Coolify secrets manager; loglarda **asla** plain-text gösterilmez. CI/CD'de secret scanner çalışır. |
| R7 | KVKK ihlali — loglama | Orta | Yüksek | Log standardı: e-posta, telefon, adres, TCKN maskelenir. `kvkk-mask.ts` yardımcı modülü tüm logger'lara zorla uygulanır. Bu ADR'nin kabul kriteri olarak denetlenir. |
| R8 | Cross-tenant raporlama verisi gecikir | Düşük | Düşük | `metrics-collector` periyodik veri çeker; SLA 5 dakika; geriye dönük telafi mümkün. |
| R9 | Tenant silme / pasife alma sırasında veri sızıntısı | Düşük | Kritik | Silme işlemi 30 günlük soft-delete + anonymize süreci; veri ihracı TSV+JSON paketi; hard-delete sonra. Detay: `docs/architecture/multi-tenant-poc-plan.md` §5. |
| R10 | Subscription / lisans dolduğunda erişim kesilir | Düşük | Orta | NestJS kontrol paneli her saat lisans kontrolü yapar; süresi dolmuş tenant'a salt okunur mod. |

---

## 7. Uygulama Notları (Implementation Notes)

- **Idempotent provision:** `scripts/provision-tenant.ts`. Birden fazla çalıştırılırsa aynı sonucu verir.
- **Tenant resolver:** `src/tenant-resolver.ts`. Domain → tenant_id eşlemesi, yalnızca sunucu tarafı.
- **RLS hazırlığı:** Veritabanı şeması, **her tenant-scoped tabloda `tenant_id`** olacak biçimde tasarlanır. RLS ileride A modeline geçiş gerekirse hazır olsun diye tüm tablolara uygulanır. PoC aşamasında Seçenek B aktif olsa bile, RLS scriptleri (`sql/rls-policies.sql`) "future-proof" olarak yazılır.
- **PoC hedefi:** İki sahte tenant ile izolasyonun çalıştığını otomatik test ile kanıtlamak. Detay: `docs/architecture/multi-tenant-poc-plan.md`.

---

## 8. Kararın Yeniden Değerlendirilme Koşulları

Bu ADR aşağıdaki durumlarda yeniden açılmalıdır:

1. Tenant sayısı 100'ü aşıp kaynak kullanımı orantısız büyürse.
2. Medusa, native multi-tenant desteği ekleyip provider izolasyonunu çözerse.
3. Yasal düzenleme (KVKK veya GDPR) tek veritabanında kalınmayı zorunlu kılarsa.
4. Bir tenant'ın verisi diğerine sızdığında (felaket senaryosu).

---

## 9. Referanslar

- `docs/research/medusa-multitenancy-research.md` — Araştırma detayları.
- `docs/architecture/multi-tenant-poc-plan.md` — PoC planı.
- GitHub Discussions: medusajs/medusa #11671, #12304, #2142.
- Rigby blog: "Multi-Tenant Architecture in Medusa" (2026).
- Medusa resmi: "Multi-Tenant Ecommerce" blog yazısı.

---

**Karar verici imzası:**

| Rol | İsim | Tarih | İmza |
|---|---|---|---|
| Mimari komite başkanı | (Faz 1'de onaylanacak) | 2026-07-02 | ☐ Onay |
| Güvenlik sorumlusu | (Faz 1'de atanacak) | 2026-07-02 | ☐ Onay |
| Veri sorumlusu (KVKK) | (Faz 1'de atanacak) | 2026-07-02 | ☐ Onay |
