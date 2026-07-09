# EtiCart — Production Deployment Rehberi

**Tarih:** 2026-07-04
**Hedef:** Coolify (self-hosted PaaS, Docker Compose tabanlı)

---

## Mimari Genel Bakış

```
                  Internet (HTTPS)
                       │
                       ▼
              ┌──────────────────┐
              │  Coolify Reverse │
              │  Proxy (Caddy)   │
              └──────────────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
  ┌─────────┐   ┌──────────┐   ┌──────────────┐
  │ Store-  │   │ Tenant   │   │  Commerce    │
  │ front   │   │ Admin    │   │  Backend     │
  │ :3000   │   │ :3001    │   │  (NestJS)    │
  └─────────┘   └──────────┘   │  :9000       │
                                └──────────────┘
                                       │
                                ┌──────┴──────┐
                                ▼             ▼
                          ┌─────────┐   ┌─────────┐
                          │Postgres │   │  Redis  │
                          │  :5432  │   │  :6379  │
                          └─────────┘   └─────────┘
```

**Domain eşlemesi (örnek):**
- `eticart.com.tr` → storefront (port 3000)
- `admin.eticart.com.tr` → tenant-admin (port 3001)
- `api.eticart.com.tr` → commerce-backend (port 9000)

---

## 1. Hazırlık

### 1.1 Domain

- Ana domain: `eticart.com.tr`
- API subdomain: `api.eticart.com.tr`
- Admin subdomain: `admin.eticart.com.tr`
- DNS: A record → Coolify sunucu IP

### 1.2 Coolify Kurulumu

Coolify zaten bir VPS'e kurulu varsayılıyorum:
- Coolify v4.x
- Docker + Docker Compose yüklü
- Reverse proxy: Caddy (Coolify otomatik yönetir)

### 1.3 Secret Üretimi

```bash
# JWT ve Cookie secret'ları
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log('COOKIE_SECRET=' + require('crypto').randomBytes(48).toString('base64'))"
# PostgreSQL şifresi
node -e "console.log('POSTGRES_PASSWORD=' + require('crypto').randomBytes(32).toString('base64'))"
```

---

## 2. Coolify Deployment

### 2.1 Yöntem A: Docker Compose (Önerilen)

**Coolify Dashboard:**
1. **New Resource** → **Docker Compose**
2. **Repository URL:** `https://github.com/eticart/eticart.git` (veya private repo)
3. **Branch:** `main`
4. **Docker Compose Location:** `docker-compose.yml`
5. **Base Directory:** `/` (root)
6. **Build Pack:** `dockerfile` (compose zaten tanımlı)

### 2.2 Yöntem B: Git Source + Manuel Docker Compose

Eğer Coolify sürümünüz compose desteklemiyorsa:
1. Her servisi ayrı ayrı **New Resource → Application** olarak tanımla
2. Her biri için `Dockerfile` path'ini göster
3. Ortak PostgreSQL ve Redis'i **New Resource → Database** ile ekle

### 2.3 Environment Variables

Coolify'da **Project → Environment Variables** bölümünde `.env.production.example`'daki tüm değerleri girin:

```bash
# Coolify UI'dan her bir değişken için:
POSTGRES_PASSWORD=<güçlü-şifre>
JWT_SECRET=<48-byte-base64>
COOKIE_SECRET=<48-byte-base64>
# ...
```

Coolify bu değerleri otomatik olarak container'lara aktarır.

### 2.4 Domain Ayarları

Her servis için Coolify'da:
- **Storefront:** `eticart.com.tr` + `www.eticart.com.tr`
- **Tenant Admin:** `admin.eticart.com.tr`
- **Backend:** `api.eticart.com.tr` (internal erişim, public olabilir)

Coolify Let's Encrypt ile otomatik SSL sağlar.

---

## 3. Migration

### 3.1 Otomatik Migration

`migrate` servisi `docker-compose.yml`'de tanımlı. `backend`'e bağımlı ve bir kere çalışır:

```bash
# Manuel tetikleme (gerekirse)
docker compose run --rm migrate
```

`docker compose up -d` komutu otomatik olarak:
1. PostgreSQL ve Redis'i başlatır
2. Healthcheck'lerini bekler
3. `migrate` servisini çalıştırır (bir kere)
4. `backend`'i başlatır
5. Storefront ve admin'i başlatır

### 3.2 Seed (Opsiyonel — Sadece İlk Kurulum)

```bash
docker compose exec backend node dist/scripts/seed.js
```

---

## 4. İlk Kurulum Sonrası

### 4.1 Healthcheck'ler

```bash
# Backend
curl https://api.eticart.com.tr/health
# → { "status": "ok", "service": "commerce-backend", "uptime": 120 }

curl https://api.eticart.com.tr/ready
# → { "status": "ready", "checks": { "database": { "ok": true }, "redis": { "ok": true } } }

# Storefront
curl https://eticart.com.tr/health

# Admin
curl https://admin.eticart.com.tr/health
```

### 4.2 Loglar

```bash
# Tüm servisler
docker compose logs -f

# Sadece backend
docker compose logs -f backend
```

### 4.3 Database Backup

```bash
# Manuel backup
docker compose exec postgres pg_dump -U eticart eticart > backup-$(date +%Y%m%d).sql

# Restore
cat backup-20260704.sql | docker compose exec -T postgres psql -U eticart eticart
```

Coolify'da **scheduled backup** task'ı tanımlayabilirsiniz.

---

## 5. Bakım

### 5.1 Deployment (Yeni Versiyon)

```bash
# Coolify Git entegrasyonu ile otomatik
# (main branch'e push → otomatik rebuild + redeploy)

# Veya manuel
cd /path/to/eticart
git pull
docker compose build
docker compose up -d
```

### 5.2 Veritabanı Yedekleme (Cron)

```bash
# /etc/cron.d/eticart-backup
0 3 * * * cd /opt/eticart && docker compose exec -T postgres pg_dump -U eticart eticart | gzip > /backups/eticart-$(date +\%Y\%m\%d).sql.gz
```

### 5.3 Log Rotation

Coolify otomatik yapar. Manuel:
```bash
# /etc/logrotate.d/docker-containers
/var/lib/docker/containers/*/*.log {
  rotate 7
  daily
  compress
  missingok
  delaycompress
  copytruncate
}
```

---

## 6. Ölçeklendirme

### 6.1 Yatay (Horizontal)

Coolify → Service → Replicas: 3
- Storefront ve Tenant Admin stateless → kolayca ölçeklenir
- Backend (NestJS) → sticky session olmadan ölçeklenir
- Postgres → vertical scale (büyük instance)
- Redis → vertical scale + Cluster modu

### 6.2 Dikey (Vertical)

CPU/RAM artırımı Coolify UI'dan tek tıkla.

### 6.3 CDN

Storefront static assetleri için Cloudflare veya BunnyCDN ekleyin:
- `/_next/static/*` → CDN
- `/public/*` → CDN

---

## 6.5 Storage (S3 / R2)

Multi-tenant dosya depolama için iki seçenek var:

### Seçenek A — Cloudflare R2 (KVKK uyumlu, önerilen)

R2, S3-compatible API ile çalışır; **sıfır egress ücreti** ve **AB bölgesi** (Frankfurt) mevcut.

**Coolify Dashboard:**
1. Cloudflare hesabı → R2 → Create bucket: `eticart-prod-r2`
2. R2 → Manage R2 API Tokens → Create API token: Object Read & Write
3. `.env.production`'a ekle:

```bash
S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<r2-token-id>
S3_SECRET_ACCESS_KEY=<r2-secret>
S3_BUCKET=eticart-prod-r2
S3_PUBLIC_BASE_URL=https://media.eticart.com.tr
```

4. Custom domain `media.eticart.com.tr` → R2 bucket'a yönlendir (Cloudflare dashboard).

### Seçenek B — MinIO (Self-hosted S3)

Geliştirme ve self-hosted kurulum için. `docker-compose.yml` MinIO servisini içerir.

```bash
# MinIO console: http://localhost:9001 (minio_admin / minio_change_me_min_8_chars)
# API: http://localhost:9000 (S3-compatible)

# Bucket oluştur
docker exec -it eticart-minio mc alias set local http://localhost:9000 minio_admin minio_change_me_min_8_chars
docker exec -it eticart-minio mc mb local/eticart-storage
```

`.env.production`'a:
```bash
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minio_admin
S3_SECRET_ACCESS_KEY=minio_change_me_min_8_chars
S3_BUCKET=eticart-storage
S3_FORCE_PATH_STYLE=true
```

### Multi-tenant İzolasyon

Tüm dosya anahtarları `tenants/<tenant_id>/<path>/<filename>` formatında üretilir.

- ✅ Cross-tenant URL paylaşımı engellenir (key prefix kontrolü)
- ✅ Path traversal saldırıları sanitize edilir (`../`, `\` → temizlenir)
- ✅ S3/R2 bucket public **değildir**; erişim yalnız presigned URL ile

### Bucket CORS (R2/MinIO)

Frontend'in presigned PUT'i çağırabilmesi için bucket CORS ayarı gerekli:

```json
[
  {
    "AllowedOrigins": ["https://admin.eticart.com.tr"],
    "AllowedMethods": ["GET", "PUT", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Cloudflare R2: Dashboard → bucket → Settings → CORS Policy.
MinIO: `mc admin policy set local readwrite user=minio_admin`.



## 7. Subdomain ve Wildcard SSL

### Mimari

Eticart SaaS modelinde her tenant `*.eticart.com.tr` subdomain'inde çalışır:

```
eticart.com.tr            → Marketing site (Next.js)
www.eticart.com.tr        → Marketing site (alias)
demo.eticart.com.tr       → Tenant: demo (Next.js storefront + API)
yildiz-tekstil.eticart.com.tr → Tenant: yildiz-tekstil
magaza.example.com        → Custom domain (tenant: demo)
api.eticart.com.tr        → Control plane (NestJS)
super.eticart.com.tr      → Super admin panel
```

### DNS Yapılandırması

Cloudflare veya başka bir DNS sağlayıcısında:

```
# Apex
eticart.com.tr        A     203.0.113.10  (Coolify server IP)
www                   CNAME eticart.com.tr

# Wildcard
*                     CNAME eticart.com.tr  (veya A record)

# Subdomain servisleri
api                   CNAME eticart.com.tr
super                 CNAME eticart.com.tr
```

### Caddy (Wildcard SSL)

`infra/caddy/Caddyfile` Caddy ile wildcard SSL otomasyonu:

- **DNS-01 challenge** (Cloudflare API token gerekli, HTTP-01 wildcard için çalışmaz)
- **Otomatik sertifika yenileme** (90 gün)
- **Reverse proxy** → storefront, tenant-admin, commerce-backend, control-plane

Başlatma:

```bash
# .env (Caddy için)
CLOUDFLARE_API_TOKEN=xxx  # DNS-01 challenge
LETSENCRYPT_EMAIL=ops@eticart.com.tr
ETICART_BASE_DOMAIN=eticart.com.tr

# Docker compose
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d caddy
```

### Tenant Çözümleme Akışı

```
Request → Caddy (SSL offload) → Next.js (storefront)
                                     │
                                     ▼ Host: demo.eticart.com.tr
                              Tenant Resolver Middleware
                                     │
                                     ├─ Reserved subdomain? (www, api, super, ...)
                                     │   → bypass, marketing site
                                     │
                                     ├─ Subdomain? (*.eticart.com.tr)
                                     │   → DB: SELECT tenant WHERE slug = 'demo'
                                     │   → x-tenant-resolved: <uuid>
                                     │
                                     └─ Custom domain? (magaza.example.com)
                                         → DB: SELECT tenant WHERE domain = ...
                                         → x-tenant-resolved: <uuid>
```

### Custom Domain Ekleme (Tenant)

Tenant admin panelinden:

```http
POST /api/v1/domains
Content-Type: application/json

{ "domain": "magaza.example.com" }

→ 201 Created
{
  "id": "domain-uuid",
  "domain": "magaza.example.com",
  "status": "pending",
  "verification": {
    "type": "CNAME",
    "name": "_eticart-verify.magaza.example.com",
    "value": "demo.eticart.com.tr",
    "ttl": 300
  }
}
```

Tenant DNS'i ayarladıktan sonra:

```http
POST /api/v1/domains/:id/verify

→ 200 OK
{
  "status": "verified",
  "verifiedAt": "2026-07-06T16:00:00.000Z",
  "sslIssuedAt": "2026-07-06T16:00:05.000Z"
}
```

### Provisioning Pipeline (Faz 15)

Yeni tenant signup'ı otomatik provisioning tetikler:

```
1. create_schema         → tenant_status_history (no-op in control-plane)
2. create_tenant_admin   → tenant_users (admin user)
3. load_default_settings → tenant_settings
4. create_storage_bucket → tenant_settings.storageBucket (R2/S3)
5. setup_subdomain_dns   → tenant_settings.subdomain (Cloudflare API)
6. create_initial_store  → placeholder
```

Her step idempotent. Hata durumunda 3 deneme + exponential backoff.

### Real-time Provisioning Status (SSE)

Müşteri signup sonrası canlı ilerleme:

```javascript
const evtSource = new EventSource(
  '/api/v1/onboarding/stream/yildiz-tekstil'
);

evtSource.addEventListener('status', (e) => {
  const data = JSON.parse(e.data);
  console.log(data.status, data.message);
  // 'draft' → 'provisioning' → 'trial'
});

evtSource.addEventListener('complete', (e) => {
  evtSource.close();
  window.location.href = 'https://yildiz-tekstil.eticart.com.tr';
});
```

## 7. Monitoring


### 7.1 Sentry (Opsiyonel)

`.env`'e:
```
SENTRY_DSN=https://xxxxx@sentry.io/123
```

Backend otomatik Sentry'ye exception gönderir (Faz 11+).

### 7.2 OpenTelemetry

`.env`'e:
```
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

Trace'ler Jaeger/Tempo'ya gider (Faz 11+).

### 7.3 Coolify Metrics

Coolify → Service → Metrics:
- CPU kullanımı
- RAM kullanımı
- Network I/O
- Disk I/O

### 7.4 Uptime Monitoring

- UptimeRobot (ücretsiz)
- Better Uptime
- Healthchecks.io

```bash
# UptimeRobot ping URL'si
https://api.eticart.com.tr/health
https://eticart.com.tr/health
https://admin.eticart.com.tr/health
```

---

## 8. Troubleshooting

### Container başlamıyor

```bash
docker compose logs backend
# Hata mesajını oku, genelde:
# - DATABASE_URL yanlış
# - JWT_SECRET tanımsız
# - Prisma generate çalışmamış (build sırasında)
```

### Migration başarısız

```bash
docker compose run --rm migrate
# Manuel çalıştır, hata detayını gör
```

### Postgres bağlantı hatası

```bash
docker compose exec backend sh
# Container içinden
npx prisma db pull  # bağlantı testi
```

### Nginx/Caddy 502 Bad Gateway

Coolify → Logs → Proxy
- Container'lar ayakta mı?
- Port doğru mu?
- Domain DNS doğru mu?

---

## 9. Maliyet Tahmini (Aylık)

| Kaynak | Minimum | Önerilen |
|--------|---------|----------|
| Coolify VPS (Hetzner/Contabo) | €5-10 | €20-40 |
| Domain (eticart.com.tr) | ₺200/yıl | ₺200/yıl |
| SSL (Let's Encrypt) | Ücretsiz | Ücretsiz |
| Sentry (free tier) | $0 | $0-26 |
| Cloudflare (free tier) | $0 | $0-20 |
| Email (Resend) | $0 (3K/ay) | $20 (50K/ay) |
| **TOPLAM** | **~€6-12/ay** | **~€40-110/ay** |

---

## 10. İlk Yayın Checklist

- [ ] Sunucu (VPS) hazır
- [ ] Coolify kurulu
- [ ] Domain DNS ayarlanmış
- [ ] SSL otomatik (Let's Encrypt)
- [ ] Secret'lar üretilmiş (JWT, Cookie, Postgres)
- [ ] `.env.production.example` → Coolify env variables
- [ ] İlk deploy (`docker compose up -d`)
- [ ] Migration çalıştı
- [ ] Seed çalıştı (opsiyonel)
- [ ] Healthcheck'ler yeşil
- [ ] SSL sertifikaları otomatik yenileniyor
- [ ] Backup cron'u ayarlanmış
- [ ] Uptime monitoring aktif
- [ ] Domain'ler doğru yönlendirilmiş
- [ ] İlk admin user oluşturulmuş
- [ ] E-Fatura adaptör yapılandırılmış (NES)
- [ ] Ödeme sağlayıcıları yapılandırılmış
- [ ] KVKK aydınlatma metinleri eklenmiş (Faz 11)

---

**Hazırlayan:** Mavis (Mavis)
**Tarih:** 2026-07-04
**Toplam dosya:** 5 (docker-compose, .env.production.example, Dockerfile'lar, health, migrate, DEPLOYMENT.md)