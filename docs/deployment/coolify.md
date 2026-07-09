# Dağıtım — Coolify Uyumlu (Faz 1)

Coolify, kendi kendine barındırılan (self-hosted) bir PaaS'tır.
Bu platform Coolify'e "uygulama" olarak eklenir ve Coolify yönetim
düzlemi üzerinden dağıtılır.

## Önkoşullar

- Coolify 4.x
- Sunucu: 4 vCPU, 8 GB RAM, 80 GB disk (başlangıç)
- Docker 24+ kurulu
- Ters proxy (Traefik, Caddy vb.) Coolify tarafından yönetilir

## Yapılandırma

1. `infra/coolify/docker-compose.prod.yml` Coolify'in "Compose" projesi
   olarak içe aktarılır.
2. Aşağıdaki ortam değişkenleri Coolify'da ayarlanır:

```env
# --- Otomatik (Coolify sağlar) ---
SERVICE_FQDN_STOREFRONT=https://storefront.example.com
SERVICE_FQDN_TENANT_ADMIN=https://tenant.example.com
SERVICE_FQDN_SUPER_ADMIN=https://admin.example.com
SERVICE_FQDN_BACKEND=https://api.example.com
SERVICE_FQDN_MEDUSA=https://medusa.example.com

DB_PASSWORD=<rastgele 32+ karakter>
JWT_SECRET=<rastgele 32+ karakter>
COOKIE_SECRET=<rastgele 32+ karakter>

ALLOWED_CORS_ORIGINS=https://storefront.example.com,https://tenant.example.com,https://admin.example.com,https://medusa.example.com

SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=
```

3. Coolify `Build Pack` ayarında "Dockerfile" seçilir ve her servis
   kendi `Dockerfile`'ını işaret eder.

## Domain Eşlemesi

Tenant domain'leri (ör. `magaza-ali.example.com`) için:

- Coolify üzerinde wildcard DNS kaydı (`*.example.com`) tanımlanır.
- Traefik, gelen `Host` başlığına göre ilgili storefront konteynerine
  yönlendirir.
- `apps/storefront` ilgili tenant'ın şemasını çözümler
  (`packages/tenant-context`, Faz 2'de tamamlanacak).

## İlk Kurulum

```bash
# Sunucuda
docker compose -f infra/coolify/docker-compose.prod.yml pull
docker compose -f infra/coolify/docker-compose.prod.yml up -d

# Migration
docker compose exec control-plane sh -c "DATABASE_URL=... pnpm --filter @eticart/infra-scripts migrate"

# Seed (yalnızca geliştirme)
docker compose exec control-plane sh -c "NODE_ENV=development pnpm --filter @eticart/infra-scripts seed"
```

## Yedekleme

- Postgres: `pg_dump` ile günlük yedek
- MinIO: S3 uyumlu senkronizasyon ile farklı bölgeye yedekleme
- Coolify üzerinden volume snapshot'lar

## Geri Dönüş

- Stack rollback: Coolify üzerinden önceki dağıtım sürümüne dön.
- Veritabanı: `pg_restore` ile son sağlam yedekten dön.
