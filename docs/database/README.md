# Veritabanı

## Şema Haritası

Faz 0'da kabul edilen **Seçenek B** mimarisi doğrultusunda:

### `pg_control` (şema: `public`)

Kontrol düzlemi tabloları (`apps/control-plane` üzerinden erişilir):

- `tenants` — kiracı ana kaydı
- `tenant_domains` — domain ↔ tenant eşlemesi
- `users` — süper admin ve tenant yöneticileri
- `kvkk_audit` — denetim kayıtları
- `_migrations` — uygulanan migration'lar

### `pg_app` (şema: `tenant_<slug>`)

Her tenant için ayrı şema. Faz 4+ ölçeğinde:

- `<schema>.customers`
- `<schema>.products`
- `<schema>.product_variants`
- `<schema>.orders`
- `<schema>.kvkk_audit`

Şema şablonu `infra/migrations/0002_apps_envelope.sql` içindedir;
tenant başına şema açma `infra/scripts/src/provision-tenant.ts` ile yapılır.

## Diyagram (özet)

```
┌──────────────── pg_control ────────────────┐
│ public.tenants                             │
│   id (UUID)  ← kontrol düzlemi birincil    │
│   slug       ← slug ile şema adı türetilir │
│ public.tenant_domains                      │
│   tenant_id → public.tenants               │
│   domain    ← çözümleme anahtarı          │
│ public.users                               │
│ public.kvkk_audit                          │
│ public._migrations                         │
└────────────────────────────────────────────┘

┌──────────────── pg_app ────────────────────┐
│ tenant_firma_a.customers                   │
│ tenant_firma_a.products                    │
│ tenant_firma_a.product_variants            │
│ tenant_firma_a.orders                     │
│ tenant_firma_a.kvkk_audit                  │
└────────────────────────────────────────────┘

┌──────────────── pg_app ────────────────────┐
│ tenant_firma_b.customers                   │
│ ...                                        │
└────────────────────────────────────────────┘
```

## Migration Sırası

1. `infra/migrations/0001_control_schema.sql` — kontrol düzlemi tabloları
2. `infra/migrations/0002_apps_envelope.sql` — şablon şema (`app_template`)
3. `infra/migrations/0003_seed_dev.sql` — geliştirme örnek tenant'ları

## İndeksler

- `tenants(slug)`
- `tenants(status)`
- `tenant_domains(tenant_id)`
- `tenant_domains(domain)` — unique
- `users(tenant_id)`
- `kvkk_audit(occurred_at)`

## RLS Hazırlığı

Faz 0'da RLS politikaları taslak olarak hazırlandı
(`faz0-poc/sql/rls-policies.sql`). Faz 2+'da her tabloya tenant_id
eklenerek RLS'ye geçiş için ön koşullar oluşturulur.

## Yedekleme

- Günlük `pg_dump` (pg_control ve pg_app)
- 30 gün tutulan şifreli yedekler
- KVKK nedeniyle geri dönüş planlı olmalı
