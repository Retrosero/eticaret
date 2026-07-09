# Medusa Çok Kiracılı (Multi-Tenant) Sınırları — Araştırma Notu

**Yazar:** Coder (Faz 0)
**Tarih:** 2026-07-02
**Durum:** Bilgilendirme / Karar Desteği (ADR-001 referansı)

> Bu doküman, Medusa'nın "multi-tenant" senaryosundaki teknik sınırlarını, resmi dokümantasyonu, GitHub tartışmaları ve bilinen workaround'ları özetleyerek karar vericilere girdi sağlar.

---

## 1. Terminoloji Ayrımı (ÇOK ÖNEMLİ)

Medusa ekosisteminde iki kavram sıklıkla karıştırılır. Önce onları ayıralım:

| Kavram | Anlam | Medusa Desteği |
|---|---|---|
| **Multi-Store** | Tek şirketin birden çok mağazası (marka/pazaryeri/şube) | ✅ Yerleşik destek (Store Module, Sales Channel) |
| **Multi-Tenant (SaaS)** | Birbirinden tamamen bağımsız şirketlerin aynı platformu kiralaması | ❌ Yerleşik destek YOK |

Bizim ihtiyacımız **ikincisi**dir: farklı firmaların birbirinin verisini, ödeme entegrasyonlarını, yapılandırmasını göremediği bir SaaS katmanı.

---

## 2. Medusa'nın Multi-Tenant'a Yönelik Yerleşik Olmayan Halleri

### 2.1. Provider'lar Uygulama Düzeyinde Singleton'tur

Her provider (SendGrid, Stripe, iyzico, PayTR, S3/R2, vs.) `medusa-config.ts` üzerinden **bir kez** oluşturulur ve uygulama ömrü boyunca paylaşılır.

Bildiğimiz somut kısıtlar:

- **Bildirim sağlayıcıları (Notifications)** kanal bazında çözümlenir. Aynı kanala iki provider kayıt olamaz — uygulama hata fırlatır.
- **SendGrid** gibi SDK'lar pakete `setApiKey(...)` ile global anahtar yazar; aynı process içinde iki farklı API anahtarı ile aynı anda çalışamaz.
- **Ödeme sağlayıcıları** (iyzico, PayTR, Param) her biri farklı API anahtarı, farklı mağaza kodu, farklı webhook gizli anahtarı gerektirir. Bunları aynı Node.js process içinde tenant bazında değiştirmek, Medusa'nın mevcut yaşam döngüsünde mümkün değildir.

**Sonuç:** Aynı Medusa instance içinde iki farklı tenant için iki farklı iyzico mağazası bağlanamaz.

### 2.2. ORM Seviyesinin Atlatan Raw Sorgular

Medusa'nın bazı kritik yolları doğrudan Knex ile çalışır ve MikroORM filter mekanizmasını devre dışı bırakır:

- Pricing modülü `calculatePrices()`
- Envanter modülü `getReservedQuantity`, `getAvailableQuantity`, `getStockedQuantity`
- RBAC için özyinelemeli CTE sorgusu
- Base repository `hardDelete()`

Bu nedenle ORM katmanında `tenant_id` filtresi yazmak, bu yolları **yakalamaz**. Bunu tek güvenli yakalayan PostgreRLS'dir; çünkü RLS veritabanı katmanında çalışır.

### 2.3. Zamanlanmış İşler (Scheduled Jobs)

"24 saatten eski terk edilmiş sepetleri bul ve hatırlatma e-postası gönder" gibi işlerde **event ID'si yoktur**; tablonun tamamı taranır. Bu durumda:

- Tarama tüm tenant'ları kapsar (tenant filtresi zorunludur).
- O an hangi tenant için hangi e-posta gönderileceğine karar vermek için ek bağlam gerekir.
- Hangi provider'ın hangi API anahtarı ile gönderileceği ayrı bir sorundur.

### 2.4. Planlanmamış Yazma Tarafı

Bir fulfillment veya notification kaydı oluşturan background akışlarda, **yeni oluşturulan kayıt hangi tenant'a ait olacak** sorusu ciddi bir tutarlılık problemidir. ULID ile okuma tarafı çalışır; yazma tarafında tenant bağlamı kırılgandır.

### 2.5. E-posta Benzersizlik Kısıtları

Medusa'nın `customer.email` alanı `(email, has_account)` üzerinde **global** tekil indekstir. İki farklı tenant aynı e-posta ile kayıt olamaz. Multi-tenant için bu kısıt yeniden tasarlanmalıdır.

---

## 3. Bilinen Workaround'lar ve Sınırları

### 3.1. Sales Channel ile "Sahte" Multi-Tenant

`trevster344` yaklaşımı: her tenant'ı bir sales channel gibi ele alıp uygulama katmanında `sales_channel_id` filtresi zorlamak. **Veri izolasyonunu tek başına garanti etmez**; bir bug veya SQL injection bu sınırı kolayca aşar. Test edilmesi ve denetlenmesi zordur.

### 3.2. RLS + Framework Patch (Rigby Yaklaşımı)

Rigby tarafından yayınlanan yaklaşım:

1. Her tabloya `tenant_id` eklenir.
2. Postgre RLS politikaları yazılır.
3. Veritabanı bağlantısı **superuser** olmayan bir rol ile yapılır (RLS superuser için baypass edilir).
4. `patch-package` ile `@medusajs/framework` patch'lenerek her bağlantıda `SET LOCAL app.current_tenant = $1` çağrısı eklenir.

**Sağladığı:**
- Veri izolasyonu veritabanı seviyesinde zorlanur, ORM bypass eden sorgular da korunur.
- Migration'lar tek bir veritabanında çalışır.

**Sağlayamadığı:**
- Provider konfigürasyon izolasyonu (aynı SendGrid anahtarı tüm tenant'lar için geçerli).
- Uygulama seviyesi plugin izolasyonu (örn. bir tenant'ın yüklediği plugin diğerini etkiler).
- Scheduled job provider seçimi.
- Framework yükseltmelerinde patch'in yeniden test edilme yükü.

### 3.3. Her Tenant İçin Ayrı Medusa Instance

Her tenant kendi Medusa instance'ını çalıştırır; bir gateway/control-plane routing yapar.

**Sağladığı:**
- Tam veri izolasyonu.
- Tam provider izolasyonu (her tenant'ın kendi iyzico/PayTR anahtarı, kendi S3 bucket'ı).
- Plugin izolasyonu.
- Framework upgrade bağımsızlığı.

**Bedeli:**
- Her tenant için ayrı deployment, ayrı veritabanı, ayrı migration.
- Kaynak kullanımı daha yüksek (bir Node process + bir Postgre bağlantı havuzu per tenant).
- Provision otomasyonu zorunludur.

---

## 4. Karşılaştırma Özeti

| Kriter | RLS ile Tek DB (A) | Ayrı Instance/DB (B) |
|---|---|---|
| Veri izolasyonu | ✅ DB seviyesinde | ✅ Doğal |
| Provider izolasyonu | ❌ Singleton kısıtı | ✅ Doğal |
| Plugin izolasyonu | ❌ Paylaşımlı | ✅ Doğal |
| Operasyonel karmaşıklık | Düşük | Yüksek (provisionlama zorunlu) |
| Kaynak kullanımı | Verimli | N kat (N = tenant sayısı) |
| Yedekleme | Tekil | Her tenant ayrı |
| Çapraz tenant sorgu (super-admin) | Kolay | Zor / özel servis gerekir |
| Framework yükseltme etkisi | Patch testi gerekir | Tenant başına kademeli |
| Saldırı yüzeyi (cross-tenant sızıntı) | Patch veya RLS kaçırılırsa geniş | Dar (doğal ayrım) |
| Uyumluluk (KVKK veri konumu) | Tek AB/tr TR bölgesi | Tenant başına yönlendirme mümkün |

---

## 5. Somut Bulgular (Referanslarla)

- GitHub Discussion #11671: "Medusa'da multi-tenant'a `tenant_id` eklemek sanıldığı kadar kolay değil; çekirdeğin birçok yeri ORM filtrelerini bypass ediyor. RLS tek güvenli yol." (jkuzmanovik, Mar 2026).
- GitHub Discussion #12304: "MedusaJS native multi-tenant desteği sağlamıyor; geliştiriciler workaround ile uğraşıyor." (feature request, 2025).
- Rigby blog: "Multi-tenant commerce için Medusa'da RLS uygulaması, non-superuser uygulama rolü ve framework patch gerektirir." (2026).
- Medusa resmi: "Store modülü multi-store destekler; multi-tenant desteği için özelleştirme gerekir." (docs.medusajs.com).
- Y Combinator tartışması: "Medusa resmi olarak multi-tenant değil; community'lerde Vendure ve ayrı instance öneriliyor." (HN, 2022 itibarıyla).

---

## 6. Çıkarımlar

1. **A modeli (RLS ile tek DB)** Medusa'nın framework patch'ini, çoklu provider kısıtını ve KVKK veri konumu gereksinimlerini karşılamaz.
2. **B modeli (ortak control-plane + tenant başına izole mağaza)** bizim ölçeğimiz (1-100 arası Türkiye merkezli firma) için doğru cevaptur; çünkü:
   - Her tenant kendi ödeme sağlayıcı anahtarlarını kullanır (B2B farklı fiyatlandırma).
   - Her tenant kendi veri bölgesinde kalabilir (KVKK veya GDPR yönlendirmesi).
   - Framework yükseltmeleri tenant başına kademeli uygulanabilir; bir tenant bozulursa diğerleri etkilenmez.
   - Saldırı yüzeyi doğal olarak ayrıdır.
3. A modelinin uygun olduğu tek senaryo: **çok küçük ölçek (≤5 tenant) ve provider izolasyonu kritik değilse**. Bizim ölçeğimiz bu değildir.

Bu bulgular, **ADR-001** kararına girdi oluşturur.

---

## 7. Kaynaklar

- GitHub Discussions #11671, #12304, #2142, #3819.
- docs.medusajs.com — Store Module, Multi-Region Recipe.
- medusajs.com/blog/multi-tenant-rigby/ — "Multi-Tenant Ecommerce: Different Medusa Use Cases".
- rigbyjs.com/blog/multi-tenancy-in-medusa — "Implement Multi-Tenancy in Medusa with PostgreSQL Row Level Security".
- rigbyjs.com — "Multi-Tenant Architecture in eCommerce: The Complete Guide (2026 Edition)".
