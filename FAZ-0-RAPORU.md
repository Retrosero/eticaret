# Faz 0 — Multi-Tenant Mimari Keşif ve ADR-001 Çalışma Raporu

**Yazar:** Coder
**Tarih:** 2026-07-02
**Durum:** ✅ Tamamlandı — kabul kriterlerinin tamamı karşılandı

---

## 1. Yapılanlar

### 1.1. Araştırma
- Medusa'nın multi-tenant sınırları dokümante edildi: GitHub Discussions #11671, #12304, #2142, #3819; resmi Medusa "Store Module" ve "Multi-Region" dokümanları; Rigby blog yazıları taranarak Türkçe özet hazırlandı.
- Sonuç: **Medusa multi-store destekler; multi-tenant desteklemez.** Provider'lar (SendGrid, iyzico, PayTR, S3/R2) singleton olup aynı process'te tenant başına farklı anahtarla çalıştırılamaz.
- Detay: `docs/research/medusa-multitenancy-research.md`.

### 1.2. ADR-001
- **Karar:** Seçenek B benimsendi — ortak kontrol paneli (NestJS) + tenant başına izole mağaza (ayrı Postgre şema). ADR-001, Bağlam, Karar, Gerekçe, Değerlendirilen Alternatifler, Sonuçlar, Risk/Azaltma ve Yeniden Değerlendirme Koşulları başlıklarıyla yazıldı.
- 10 risk kalemi ve her biri için azaltma stratejisi eklendi.
- Detay: `docs/adr/ADR-001-multitenancy.md`.

### 1.3. PoC Tasarımı ve Uygulaması
- **Mimari:** İki ayrı Postgre veritabanı (`pg_control` + `pg_app`); her tenant kendi şemasında (`tenant_a`, `tenant_b`).
- **Kod bileşenleri:**
  - `src/tenant-resolver.ts` — Domain → tenant çözümleme (güvenli, header taklidi yok).
  - `src/store-api.ts` — Örnek mağaza veri erişim katmanı (`listProducts`, `getProduct`, `getOrder`, `createProduct`, `createCustomer`, `createOrder`, `countTables`).
  - `src/kvkk-mask.ts` — KVKK uyumlu loglama (`maskEmail`, `maskPhone`, `maskTckn`, `maskAddress`, `safeLog`).
  - `src/db.ts` — pg_control ve pg_app havuzları; `withAppClient(schemaName, fn)` ile şema-izole çalışma.
  - `src/env.ts` — `.env` yükleyici.
  - `sql/0001_control_schema.sql` — `tenants`, `tenant_domains`, `kvkk_audit`.
  - `sql/0001_app_schema.sql` — Her tenant için `customers`, `products`, `orders`, `kvkk_audit` (her tabloda `tenant_id`).
  - `sql/rls-policies.sql` — RLS politikaları (Seçenek A geri dönüşü için hazır).
  - `sql/0002_seed_control.sql` — İki örnek tenant seed.
  - `scripts/run-sql.ts` — SQL dosyalarını doğru DB'ye yönlendiren runner.
  - `scripts/provision-tenant.ts` — Idempotent tenant provision scripti (slug doğrulama, `ON CONFLICT`, `IF NOT EXISTS`).
  - `scripts/isolation-test.ts` — 19 maddelik otomatik izolasyon testi.

### 1.4. Migration ve Provision Stratejisi
- `scripts/provision-tenant.ts`:
  - Slug format doğrulaması (`/^[a-z0-9_-]+$/`).
  - Schema adı güvenli formata zorlanır (`tenant_<slug_with_underscore>`).
  - `tenants` tablosuna `ON CONFLICT (slug) DO UPDATE` ile idempotent UPSERT.
  - `tenant_domains` için `ON CONFLICT (domain) DO NOTHING`.
  - Schema ve tablolar `CREATE ... IF NOT EXISTS`.
  - KVKK audit hem kontrol düzleminde hem şema içinde yazılır.
- Migration stratejisi (`docs/architecture/multi-tenant-poc-plan.md` §6): sıralı `migrations/` dosyaları, her dosya idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), `*.down.sql` rollback ikizleri.

### 1.5. Tenant Yaşam Döngüsü
- **Provision:** Kontrol tablosuna INSERT + şema oluşturma + tablolar + KVKK audit.
- **Suspend:** `tenants.status = 'suspended'`.
- **Export:** TSV + JSON paketi, 7 gün imzalı URL, AES-256-GCM şifreleme.
- **Hard Delete:** 30 gün soft-delete → anonymize → DROP SCHEMA; audit trail ayrı DB'de tutulur.

---

## 2. Test Sonuçları

`npm run test:isolation` çıktısı (tam metin `faz0-poc/test-output.txt`'de):

```
===========================================
 Faz 0 — Multi-Tenant İzolasyon Testleri
===========================================

[TEST 1] Veri izolasyonu
  ✓ tenant_a ürünleri tenant_a tarafından listelenebilir: 3 ürün
  ✓ tenant_b ürünleri tenant_b tarafından listelenebilir: 2 ürün
  ✓ tenant_a ve tenant_b ürün ID kümeleri ayrık: kesişim: 0
  ✓ tenant_b şemasında, tenant_a ürün ID sorgulamak -> null

[TEST 2] ID tahmin saldırısı
  ✓ tenant_a şemasında tenant_b sipariş ID sorgulamak -> null
  ✓ tenant_b kendi siparişine erişebilir

[TEST 3] Domain taklidi
  ✓ firma-a.local -> tenant_a
  ✓ firma-b.local -> tenant_b
  ✓ bilinmeyen domain -> null (bilgi sızdırma yok)
  ✓ firma-a.local -> tenant_a ID doğrulanır
  ✓ firma-a.local ile tenant_b ID talep etmek -> false
  ✓ www.firma-a.local alt-domaini -> tenant_a

[TEST 4] x-tenant-id header taklidi
  ✓ Host=firma-a.local ile çözümleme doğru tenant döndürür
  ✓ Host=firma-b.local ile çözümleme tenant_b döndürür (header manipülasyonu etkisiz)

[TEST 5] Idempotent provision
  ✓ idempotent provision: tenant_id değişmedi
  ✓ idempotent provision: schema tablo sayısı tutarlı

[TEST 6] KVKK maskeleme
  ✓ email maskelenir: a***@firma-a.local
  ✓ phone maskelenir: +XX XXX XXX 4567

[TEST 7] RLS politikaları hazır (Seçenek A geri dönüşü için)
  ✓ RLS politikaları en az 3 tablo için tanımlı (customers, products, orders): policy sayısı: 6

===========================================
 ÖZET: 19/19 geçti
 Tüm testler başarılı ✓
```

### 2.1. Ek Idempotentlik Kanıtı
`scripts/provision-tenant.ts a` 5 kez ardışık çalıştırıldı:

| Run | tenant_id | Hata |
|---|---|---|
| 1 | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` | yok |
| 2 | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` | yok |
| 3 | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` | yok |
| 4 | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` | yok |
| 5 | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` | yok |

Veritabanında `tenants` tablosunda `slug='a'` için **tek satır** mevcut; `updated_at` her çalıştırmada yenilenir, `tenant_id` hiç değişmez.

### 2.2. Tip Denetimi
`npx tsc --noEmit` çıkışı 0 — strict TypeScript modunda temiz.

---

## 3. Bulgular

### 3.1. Medusa Tarafı
1. **Provider izolasyonu kesin kısıt:** SendGrid gibi SDK'lar global `setApiKey` çağrısı yaptığı için, aynı Node process içinde iki farklı tenant için iki farklı API anahtarı çalıştırmak mümkün değildir. Bu, Seçenek A'nın önündeki en büyük engeldir.
2. **ORM bypass eden raw Knex yolları var** (pricing, inventory, RBAC). Tek başına ORM filtresi güvenli değildir; ancak RLS bunu veritabanı katmanında çözer.
3. **Multi-store ≠ multi-tenant:** Medusa'nın "Store" modülü tek şirket için çoklu marka/pazaryeri anlamına gelir; birden çok bağımsız şirketin izolasyonu için tasarlanmamıştır.

### 3.2. Mimari Taraf
1. **Fiziksel ayrım en güvenli yol:** Ayrı PG schema, ORM seviyesinde ihmal veya SQL injection'a karşı doğal güvenlik sağlar. Tenant ID tahmin saldırısı test edildi — tenant_a şeması tenant_b sipariş ID'sini sorgulayamıyor.
2. **Domain resolver istemciden bağımsız olmalı:** `x-tenant-id` header taklidi mümkün olmamalı. Sadece `Host` header'ından tenant çözümleme bunu garantiler.
3. **RLS "future-proof" gereksinim:** Tablolara `tenant_id` eklemek ve RLS politikası tanımlamak ileride Seçenek A'ya dönüş için sıfır maliyetli bir önlem; bu PoC'de şemalar RLS'ye hazır hale getirildi.

### 3.3. Operasyonel Taraf
1. **Provision scripti idempotent çalışıyor:** 5 ardışık çalıştırmada sıfır hata, tek tenant_id.
2. **KVKK maskeleme çalışıyor:** E-posta `a***@firma-a.local`, telefon `+XX XXX XXX 4567`.
3. **Geliştirici deneyimi:** Sadece iki `.env` değişkeni ile çalışır; Node 20+, Postgre 15 yeterli.

---

## 4. Karar (Tek Cümle)

**Seçenek B benimsendi**: Ortak kontrol paneli (NestJS) + tenant başına izole mağaza (ayrı Postgre şema + aynı uygulama imajı + otomatik provision). Gerekçe, ADR-001 §3'te ayrıntılı.

---

## 5. Kabul Kriterleri (İşaretli)

| # | Kriter | Durum |
|---|---|---|
| 1 | Tenant A kullanıcısı hiçbir yöntemle Tenant B ürünlerini görememeli | ✅ Test 1 |
| 2 | Tenant A yöneticisi Tenant B sipariş ID'sini tahmin ederek erişememeli | ✅ Test 2 |
| 3 | Domain değiştirerek tenant bağlamı taklit edilememeli | ✅ Test 3 |
| 4 | `x-tenant-id` header taklidi işe yaramamalı (ek kriter) | ✅ Test 4 |
| 5 | Seçilen mimarinin gerekçesi belgelenmiş olmalı (ADR-001) | ✅ docs/adr/ADR-001-multitenancy.md |
| 6 | Uygulanabilir bir provision komutu veya scripti bulunmalı | ✅ scripts/provision-tenant.ts |
| 7 | Otomatik izolasyon testleri başarılı olmalı | ✅ 19/19 |

---

## 6. Sonraki Adımlar (Faz 1 için Öneriler)

1. **Faz 1 — Monorepo & Infra Başlangıcı**
   - Turborepo + pnpm çatısı kurulmalı.
   - `apps/store-api` (Medusa) ve `apps/control-api` (NestJS) iskeletleri.
   - `packages/db` (ortak tipler), `packages/kvkk` (maskeleme yardımcısı olarak paket), `packages/tenant-resolver` (PoC'ten devralınır).
   - CI/CD: GitHub Actions + Coolify deploy.

2. **Faz 2 — Tenant Domain & Routing**
   - `tenant-resolver`'ı NestJS middleware olarak yeniden yaz.
   - Coolify stack şablonu ile tenant başına otomatik deploy.
   - Traefik/Caddy ile TLS sonlandırma ve domain doğrulama.

3. **Faz 3 — Auth & RBAC**
   - Süper admin girişi (kontrol düzlemi).
   - Tenant yöneticisi girişi (kendi tenant'ı).
   - JWT veya session token, `tenant_id` claim.

4. **Faz 5 — Tema & SEO** sırasında KVKK çerez banner'ı entegrasyonu.

5. **Faz 6 — Ödeme** sırasında iyzico, PayTR, Param adaptörlerinin her tenant için ayrı anahtarla çalıştığını kanıtlayan entegrasyon testleri.

6. **Faz 7 — Sipariş & Fatura** sırasında tenant başına KDV/fatura yapılandırması.

---

## 7. Oluşturulan Dosyalar

```
/workspace/proje/
├── docs/
│   ├── adr/
│   │   └── ADR-001-multitenancy.md                              # 13 KB Türkçe ADR
│   ├── architecture/
│   │   └── multi-tenant-poc-plan.md                             # 9.8 KB PoC planı
│   └── research/
│       └── medusa-multitenancy-research.md                      # 7.9 KB araştırma
├── faz0-poc/
│   ├── README.md                                                # PoC kullanım kılavuzu
│   ├── docker-compose.yml                                       # PoC için compose (Docker yoksa lokal postgres)
│   ├── package.json                                             # TS strict + pg + uuid
│   ├── tsconfig.json                                            # strict, ESM, Node 22
│   ├── .env                                                     # lokal DB bağlantıları
│   ├── test-output.txt                                          # test çıktısı arşivi
│   ├── src/
│   │   ├── tenant-resolver.ts                                   # domain->tenant çözümleme
│   │   ├── store-api.ts                                         # örnek veri erişim katmanı
│   │   ├── kvkk-mask.ts                                         # KVKK loglama yardımcıları
│   │   ├── db.ts                                                # pg_control + pg_app havuzları
│   │   ├── env.ts                                               # .env yükleyici
│   │   ├── isolation-test.ts                                    # (spec uyumu için re-export)
│   │   └── rls-policies.sql -> ../sql/rls-policies.sql          # (spec uyumu için symlink)
│   ├── scripts/
│   │   ├── provision-tenant.ts                                  # idempotent provision
│   │   ├── run-sql.ts                                           # SQL runner
│   │   └── isolation-test.ts                                    # 19 maddelik izolasyon testi
│   └── sql/
│       ├── 0001_control_schema.sql                              # tenants, tenant_domains, kvkk_audit
│       ├── 0001_app_schema.sql                                  # tenant_a, tenant_b tabloları
│       ├── 0002_seed_control.sql                                # iki örnek tenant
│       └── rls-policies.sql                                     # RLS politikaları (hazır)
└── FAZ-0-RAPORU.md                                              # bu rapor
```

---

## 8. Doğrulama

```bash
cd /workspace/proje/faz0-poc
npm run test:all                 # tüm akışı uçtan uca çalıştırır
```

`test:all` çıktısının son satırı: **"Tüm testler başarılı ✓ — 19/19"**.

---

**Hazırlayan:** Coder
**Karar:** Faz 0 → Faz 1'e geçiş uygundur.
