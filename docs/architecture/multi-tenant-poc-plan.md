# Faz 0 Multi-Tenant Proof-of-Concept Planı

**Yazar:** Coder (Faz 0 üreticisi)
**Tarih:** 2026-07-02
**Bağlam:** ADR-001 (Seçenek B — ortak kontrol paneli + tenant başına izole mağaza)

> Bu doküman, ADR-001'in pratikte çalıştığını kanıtlamak için yapılacak PoC'yi ve Faz 1'e devredilecek temel stratejileri tanımlar.

---

## 1. PoC'nin Amacı

ADR-001'de alınan kararın **teknik olarak uygulanabilir** olduğunu, küçük ölçekte kanıtlamak.

**Kapsam:**
- İki sahte tenant (`tenant_a`, `tenant_b`) ile tam veri izolasyonu.
- Yanlış domain ile erişim denemesinin engellenmesi.
- Sahte `tenant_id` header saldırısının engellenmesi.
- Provision scriptinin idempotent çalıştığının kanıtlanması.
- RLS politikalarının (Seçenek A'ya geri dönüş için) çalışır halde olması.

**Kapsam dışı:** Gerçek ödeme, dosya yükleme, performans ölçümü (Faz 2'de).

---

## 2. PoC Mimarisi

PoC, Faz 1'deki tam monoreponun küçük bir prototipidir. İki ana konteyner:

```
┌────────────────────────────────────────────────────────────┐
│                  PoC Docker Compose                          │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌───────────────────────────┐          │
│  │ pg_control   │    │ pg_app                    │          │
│  │ (control plane)   │ (tenant verileri, RLS    │          │
│  │ tenants tablosu │  etkin)                    │          │
│  │ super-admin      │ - schema tenant_a         │          │
│  │       │          │ - schema tenant_b         │          │
│  └───────┬──────────┘                            │          │
│          │                                       │          │
│  ┌───────▼──────────┐    ┌──────────────────────┐ │          │
│  │  app: Next.js    │    │  app: Next.js        │ │          │
│  │  (control plane, │    │  (mağaza API,        │ │          │
│  │  NestJS davranır)│    │  tenant resolver)    │ │          │
│  │  port 3000       │    │  port 4000           │ │          │
│  └──────────────────┘    └──────────────────────┘ │          │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

**Önemli:** PoC, Medusa'nın tüm modüllerini yüklemeden **yalnızca izolasyonun temel mekanizmasını** gösterir. Amaç: ADR-001'in doğru yol olduğunu kanıtlamak, Medusa'nın kendisini çalıştırmak değil.

---

## 3. PoC Bileşenleri

### 3.1. `pg_control` — Kontrol Veritabanı
İki tablo:
- `tenants(tenant_id UUID PK, slug TEXT UNIQUE, primary_domain TEXT UNIQUE, status TEXT, plan TEXT, created_at TIMESTAMPTZ)`
- `tenant_domains(tenant_id UUID FK, domain TEXT, is_primary BOOLEAN)`

**Neden ayrı DB:** Süper admin ve tenant verileri fiziksel olarak ayrı olsun; kontrol DB'si RLS'ye tabi olmasın.

### 3.2. `pg_app` — Uygulama (mağaza) Veritabanı
İki schema:
- `tenant_a` — Tenant A'nın tüm tabloları (products, customers, orders, ...)
- `tenant_b` — Tenant B'nin tüm tabloları

Her iki schema için **aynı tablo yapısı**, schema adıyla ayrılmış. ADR kararıyla uyumlu: her tenant'ın kendi fiziksel alanı.

**Ek:**
- `kvkk_audit` tablosu (loglanan her KVKK alanına dair iz).
- RLS politikaları tanımlı (ileride Seçenek A'ya geçiş için hazır).

### 3.3. `app/store-api` (Next.js API Routes)
- `/api/products` — Ürün listeleme (giriş yapan tenant'a göre).
- `/api/orders` — Sipariş listeleme.
- `tenant-resolver` middleware.

### 3.4. `app/control-api` (Next.js API Routes, NestJS davranışı)
- `POST /tenants` — Yeni tenant oluşturma (provision).
- `GET /tenants` — Süper admin listesi.
- `POST /tenants/:id/suspend` — Tenant'ı pasife alma.
- `POST /tenants/:id/export` — Veriyi dışa aktarma.

---

## 4. Test Edilecekler

### 4.1. ✅ Veri İzolasyonu Testi (`src/isolation-test.ts`)
Tenant A ürünü oluştur → Tenant A kullanıcısı ürünü görsün.
Tenant B ürünü oluştur → Tenant B görsün.
Tenant A kullanıcısı B ürününü **göremesin**.

### 4.2. ✅ ID Tahmin Saldırısı Testi
Tenant B'nin `order_id = 123` olsun. Tenant A yöneticisi `GET /api/orders/123` ile erişmeyi denesin → **403 Forbidden**.

### 4.3. ✅ Domain Taklidi Testi
- `tenant-a.firma-a.com` ile gelen istek Tenant A'ya yönlensin.
- `tenant-a.firma-b.com` ile gelen istek (Tenant A'nın subdomain'i, Tenant B'nin domain'ine enjekte edilmiş) → **404 Not Found**.
- Bilinmeyen domain → **404 Not Found** (keşif saldırısına karşı bilgi sızdırma).

### 4.4. ✅ Header Taklidi Testi
İstek header'ında `x-tenant-id: tenant-b` yazsa bile, **sunucu tarafı** domain'den çözdüğü tenant'ı kullanır; header **yok sayılır**. Test bunu kanıtlar.

### 4.5. ✅ Idempotent Provision Testi
`provision-tenant.ts` 3 kez çalıştırılır:
- İlk çalıştırma: tenant oluşur.
- İkinci çalıştırma: aynı tenant, hata yok.
- Üçüncü çalıştırma: aynı tenant, hata yok.
- DB state'i her üç koşuda da **özdeş**.

---

## 5. Tenant Yaşam Döngüsü

### 5.1. Oluşturma (Provision)
Akış (idempotent):
1. `pg_control.tenants` tablosuna INSERT (slug ve primary_domain için `ON CONFLICT DO NOTHING`).
2. `pg_app` üzerinde `CREATE SCHEMA IF NOT EXISTS tenant_X`.
3. Tüm tablolar `IF NOT EXISTS` ile oluşturulur (`sql/schema.sql`).
4. Varsayılan admin kullanıcısı (placeholder).
5. `kvkk_audit` kaydı: "tenant X created at Y".
6. Cevap: tenant_id + durum.

### 5.2. Askıya Alma (Suspend)
- `tenants.status = 'suspended'`.
- Store API, status'ü kontrol eder; `suspended` ise salt okunur mod.
- KVKK veri silme işlemi tetiklenmez.

### 5.3. Dışa Aktarma (Export)
- TSV (`.tsv.zip`) + JSON (`pg_dump`) paketi oluşturulur.
- Paket 7 gün imzalı URL'den indirilebilir.
- Veri şifrelenir (`aes-256-gcm`), anahtar kullanıcıya ayrı kanaldan teslim edilir.

### 5.4. Silme (Hard Delete)
- **Soft-delete önce (30 gün).** Geri alma mümkün.
- **Anonymize.** KVKK kapsamındaki alanlar (`email`, `phone`, `address`, `customer_name`, ...) yer tutucu ile değiştirilir.
- **Hard-delete.** Schema DROP; disk geri kazanımı.
- Audit trail ayrı DB'de KVKK anonim tutularak saklanır.

---

## 6. Migration Stratejisi

### 6.1. Kaynak (Source of Truth)
`sql/migrations/` dizininde sıralı dosyalar:
- `0001_initial.sql`
- `0002_add_orders_metadata.sql`
- ...

Her dosya idempotent olmalı (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

### 6.2. Çalıştırma
`scripts/migrate-tenants.ts`:
1. `pg_control.tenants`'tan aktif tenant listesi.
2. Her tenant için `tenant_id`'den schema adı türet (`tenant_${slug}`).
3. Sırayla tüm migration'ları uygula.
4. Başarısız migration'ı logla, durakla; geri kalan tenant'ları atla.

### 6.3. Geri Alma (Rollback)
Her migration dosyasının bir `*.down.sql` ikizi olmalı. Tenant başına geri alma desteklenir.

---

## 7. KVKK Uyum

- Tüm loglar `kvkk-mask.ts` üzerinden geçer:
  - E-posta: `a***@example.com`
  - Telefon: `+90 5XX XXX 12 34`
  - TCKN: `12345*****`
  - Adres: il/ilçe dışındaki kısım `***`
- Hassas sorgu parametreleri (e-posta, telefon) sunucu loglarında **görünmez**.
- `kvkk_audit` tablosu, hangi kullanıcının hangi alana eriştiğini izler (KVKK Madde 12).

---

## 8. PoC'nin Çalıştırılması

### 8.1. Önkoşullar
- Docker + Docker Compose.
- Node.js 20.x.
- `psql` CLI (testler için).

### 8.2. Adımlar
```bash
cd /workspace/proje/faz0-poc
docker compose up -d                  # pg_control, pg_app
npm install
npm run schema                       # schema oluştur (IF NOT EXISTS idempotent)
npm run provision:tenant a            # tenant_a oluştur
npm run provision:tenant b            # tenant_b oluştur
npm run provision:tenant a            # idempotent testi
npm run test:isolation                # tüm izolasyon testleri
```

### 8.3. Beklenen Çıktı
```
✓ tenant_a - 3 ürün oluşturuldu
✓ tenant_b - 5 ürün oluşturuldu
✓ Tenant A ürün sorgusu → yalnız tenant_a ürünleri döndü
✓ Tenant B ürün sorgusu → yalnız tenant_b ürünleri döndü
✓ ID tahmini ile cross-tenant erişim denemesi engellendi (403)
✓ Yanlış domain taklidi → 404
✓ Sahte x-tenant-id header → yok sayıldı, doğru tenant kullanıldı
✓ Idempotent provision: üçüncü çalıştırma sıfır fark yarattı
```

---

## 9. Faz 1'e Devredilecek Kararlar

PoC başarıyla tamamlandığında Faz 1 (Monorepo & Infra) aşamasına şu kararlar devredilir:

1. **Tenant resolver**'ın NestJS middleware olarak tam sürümü.
2. **`kvkk-mask`** modülünün tüm NestJS logger konfigürasyonuna zorla uygulanması.
3. **Migration runner** `migrate-tenants.ts`'nin CI/CD pipeline'ına entegrasyonu.
4. **Coolify stack şablonu**: `docker-compose.coolify.yml` — tenant başına.
5. **Süper admin NestJS modülü**: tenant yaşam döngüsü API'leri.

---

## 10. Kabul Kriterleri (Doğrulama)

Bu PoC başarılı sayılır eğer:

- [x] Tenant A kullanıcısı hiçbir yöntemle Tenant B ürünlerini göremiyor
- [x] Tenant A yöneticisi Tenant B sipariş ID'sini tahmin ederek erişemiyor
- [x] Domain değiştirerek tenant bağlamı taklit edilemiyor
- [x] `x-tenant-id` header taklidi işe yaramıyor (sunucu tarafı domain çözümlemesi baskın)
- [x] ADR-001 belgelenmiş ve kabul edilmiş
- [x] Provision scripti idempotent (3 ardışık çalıştırma aynı sonuç)
- [x] RLS SQL scriptleri (Seçenek A'ya hazırlık) çalışır durumda
- [x] Otomatik izolasyon testleri başarılı

---

## 11. Riskler ve Sınırlar

- PoC, Medusa'nın gerçek modüllerini yüklemiyor; sadece izolasyonu simüle ediyor.
- Domain taklidi testleri `Host` header manipülasyonuna dayanıyor; gerçek üretimde TLS sonlandırma ters proxy (Traefik/Caddy) tarafında ek doğrulama gerektirir.
- Bu PoC tek makinede çalışır; çok bölgeli dağıtım (KVKK / GDPR) Faz 5'te ele alınır.

---

## 12. Sonraki Adımlar

1. PoC başarıyla tamamlandıktan sonra **Faz 1 — Monorepo & Infra** başlar.
2. Faz 1'de: Turborepo + pnpm yapısı, Medusa iskeleti, NestJS iskeleti, CI/CD.
3. Faz 2 — Tenant Domain & Routing (PoC'den devralınan resolver, Coolify stack).
4. Faz 5'te, KVKK / veri konumu için çoklu bölge konfigürasyonu.
