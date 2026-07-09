# Faz 0 — Multi-Tenant İzolasyon Proof-of-Concept

> Bu PoC, **ADR-001 — Multi-Tenant Mimari Seçimi**'nin uygulanabilirliğini kanıtlar.
> Amacı: tam bir e-ticaret sistemi inşa etmek değil, **tenant izolasyonun çalıştığını**
> küçük ölçekte göstermektir.

## İçerik

- `src/tenant-resolver.ts` — Domain'den tenant çözümleme (güvenli, header taklidi yok)
- `src/store-api.ts` — Örnek mağaza veri erişim katmanı
- `src/kvkk-mask.ts` — KVKK uyumlu loglama yardımcıları
- `src/db.ts` — pg_control + pg_app bağlantı havuzları
- `sql/0001_control_schema.sql` — Kontrol düzlemi şeması
- `sql/0001_app_schema.sql` — Uygulama şeması (customer/product/order)
- `sql/rls-policies.sql` — RLS politikaları (Seçenek A'ya hazırlık)
- `scripts/provision-tenant.ts` — Idempotent tenant oluşturma
- `scripts/isolation-test.ts` — Otomatik izolasyon testleri

## Önkoşullar

- Docker + Docker Compose
- Node.js ≥ 20
- `npm` veya `pnpm`

## Hızlı Başlangıç

```bash
# 1. Postgre instance'larını başlat
docker compose up -d

# 2. Bağımlılıkları kur
npm install

# 3. Şemaları uygula (idempotent)
npm run schema

# 4. RLS politikalarını etkinleştir
npm run rls

# 5. İki tenant oluştur
npm run provision:tenant a
npm run provision:tenant b

# 6. Idempotentliği kanıtla (3. kez çalıştır)
npm run provision:tenant a

# 7. Tüm izolasyon testlerini çalıştır
npm run test:isolation
```

## Veya hepsini tek seferde

```bash
npm run test:all
```

## Beklenen Çıktı

```
===========================================
 Faz 0 — Multi-Tenant İzolasyon Testleri
===========================================

[TEST 1] Veri izolasyonu
  ✓ tenant_a ürünleri tenant_a tarafından listelenebilir
  ✓ tenant_b ürünleri tenant_b tarafından listelenebilir
  ✓ tenant_a ve tenant_b ürün ID kümeleri ayrık
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
  ✓ provision sonrası tenant_id değişmedi

[TEST 6] KVKK maskeleme
  ✓ email maskelenir
  ✓ phone maskelenir

[TEST 7] RLS politikaları hazır (Seçenek A geri dönüşü için)
  ✓ RLS politikaları en az 3 tablo için tanımlı (customers, products, orders)

===========================================
 Tüm testler başarılı ✓
```

## Mimari Özet

```
┌─────────────────────────────────────────────────────────────┐
│             Faz 0 PoC — Mimari                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│    HTTP (gelecekte Next.js) ─► tenant-resolver              │
│                                    │                        │
│                                    ▼                        │
│                              pg_control.tenants             │
│                                    │                        │
│                                    ▼ (şema adı)             │
│                              pg_app.tenant_<slug>            │
│                                - customers, products,       │
│                                - orders, kvkk_audit         │
│                                                              │
│   Her tenant için ayrı fiziksel şema.                        │
│   Cross-tenant sorgu mimari olarak imkânsız.                 │
└─────────────────────────────────────────────────────────────┘
```

## KVKK

- Tüm log çağrıları `kvkk-mask.ts` üzerinden geçmelidir.
- Test çıktılarında UUID'ler maskelenmiş gösterilir.
- `kvkk_audit` her tenant şemasında mevcuttur.

## Bilinen Sınırlar

- Bu PoC, Medusa'nın tüm modüllerini yüklemez. Sadece izolasyon alt yapısını doğrular.
- Çoklu bölge (KVKK/GDPR) Faz 5'te ele alınır.
- Production deployment Coolify + Docker stack şablonu Faz 1'de hazırlanır.

## Daha Fazla Bilgi

- `../docs/adr/ADR-001-multitenancy.md` — Multi-tenant karar belgesi
- `../docs/architecture/multi-tenant-poc-plan.md` — PoC detay planı
- `../docs/research/medusa-multitenancy-research.md` — Medusa sınırları araştırma notu
