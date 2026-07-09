# Faz 15 — Wildcard SSL & Subdomain Provisioning

**Tarih:** 2026-07-06
**Süre:** ~2 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Signup olan her tenant'ın **otomatik olarak** kendi subdomain'inde (`tenant.eticart.com.tr`) çalışmasını sağlamak. Caddy reverse proxy ile wildcard SSL, otomatik tenant çözümleme, canlı provisioning durumu.

---

## 2. Mimari

```
┌────────────────────────────────────────────────────────────────┐
│  Internet                                                       │
│    │ demo.eticart.com.tr                                        │
│    │ yildiz-tekstil.eticart.com.tr                              │
│    │ magaza.example.com (custom domain)                        │
└────────────────────┬───────────────────────────────────────────┘
                     │ 443 (HTTPS)
                     ▼
┌────────────────────────────────────────────────────────────────┐
│  Caddy (Reverse Proxy + Wildcard SSL)                          │
│                                                                 │
│  - Let's Encrypt DNS-01 (Cloudflare API)                       │
│  - *.eticart.com.tr → wildcard cert                            │
│  - Custom domains → per-domain cert                            │
│  - Auto-renewal (60 gün)                                       │
└────────────────────┬───────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬─────────────┐
        ▼            ▼            ▼             ▼
   storefront    tenant-admin   super-admin   commerce-backend
   (3000)        (3002)         (3003)        (3001)
        │            │            │             │
        └────────────┴────────────┴─────────────┘
                     │
                     ▼
   ┌─────────────────────────────────────────┐
   │  Tenant Resolver Middleware              │
   │                                          │
   │  Host: demo.eticart.com.tr               │
   │    → DB: tenants WHERE slug='demo'      │
   │    → x-tenant-resolved: <uuid>           │
   └─────────────────────────────────────────┘
```

---

## 3. Yeni Bileşenler

### 3.1 Tenant Resolver Middleware

**Dosya:** `apps/control-plane/src/tenants/tenant-resolver.middleware.ts`

**Sorumluluklar:**
- `Host` header parse → subdomain veya custom domain
- DB'den tenant çözümleme
- `x-tenant-resolved` header set etme
- Reserved subdomain bypass (www, api, super, ...)
- Public path bypass (/api/v1/plans, /api/v1/onboarding, ...)
- In-memory cache (5 dakika TTL)
- `X-Forwarded-Host` desteği (Cloudflare/Coolify proxy arkası)

**Subdomain Mantığı:**
- `demo.eticart.com.tr` → `demo` (subdomain)
- `magaza.example.com` → null (custom domain)
- `eticart.com.tr` → null (root)
- `www.eticart.com.tr` → null (alias)

**Reserved List:**
```
www, api, app, admin, static, cdn, mail, status, docs, blog,
super, super-admin, control-plane, root, auth, onboarding,
pricing, billing, signup, login, help, support, tenant, tenants
```

### 3.2 Provisioning Step'leri (Sprint 15 Yenileri)

**`create_storage_bucket`:**
- Per-tenant R2/S3 bucket oluştur
- Bucket adı: `eticart-{slug}`
- Idempotent (`ON CONFLICT`)
- Dry-run desteği (`STORAGE_DRY_RUN=true`)

**`setup_subdomain_dns`:**
- Cloudflare API ile CNAME kaydı
- Proxied (Cloudflare proxy aktif)
- Dry-run desteği (`DNS_DRY_RUN=true`)

**Step Sırası (güncel):**
```
1. create_schema         (DB schema init)
2. create_tenant_admin   (admin user)
3. load_default_settings (tenant_settings)
4. create_storage_bucket (R2/S3 bucket) ← 🆕
5. setup_subdomain_dns   (Cloudflare)    ← 🆕
6. create_initial_store  (placeholder)
```

### 3.3 Real-time Provisioning Status (SSE)

**Endpoint:** `GET /api/v1/onboarding/stream/:slug`

**Kullanım (Frontend):**
```javascript
const evtSource = new EventSource(
  `/api/v1/onboarding/stream/${tenantSlug}`
);

evtSource.addEventListener('status', (e) => {
  const data = JSON.parse(e.data);
  // data.status: 'draft' | 'provisioning' | 'trial' | 'active' | ...
  // data.message: human-readable
  updateProgressUI(data);
});

evtSource.addEventListener('complete', () => {
  evtSource.close();
  window.location.href = `https://${tenantSlug}.eticart.com.tr`;
});
```

**Backend akışı:**
- İlk status hemen gönderilir
- 2 saniyede bir güncellenir
- 60 saniye sonra timeout (max 30 iterasyon)
- Status `trial` veya `active` olunca otomatik kapanır

### 3.4 Caddyfile (Wildcard SSL)

**Dosya:** `infra/caddy/Caddyfile`

**Yapılandırılmış rotalar:**

| Domain | Reverse Proxy | Açıklama |
|--------|---------------|----------|
| `eticart.com.tr`, `www.` | storefront:3000 | Marketing site |
| `*.eticart.com.tr` | storefront:3000 | Tenant subdomain'leri |
| `*.eticart.com.tr/api/*` | commerce-backend:3001 | Tenant API |
| `*.eticart.com.tr/admin*` | tenant-admin:3002 | Tenant admin panel |
| `super.eticart.com.tr` | super-admin:3003 | Platform yönetimi |
| `api.eticart.com.tr` | control-plane:4000 | Control plane API |

**SSL:**
- Let's Encrypt DNS-01 challenge (wildcard için HTTP-01 çalışmaz)
- Cloudflare API token gerekli (`CLOUDFLARE_API_TOKEN` env)
- 60 gün otomatik yenileme

---

## 4. Yeni API Endpoint'ler

### 4.1 SSE Stream

```http
GET /api/v1/onboarding/stream/:slug
Accept: text/event-stream

→ 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"event":"status","status":"provisioning","subdomain":"demo.eticart.com.tr","message":"Sunucu kaynakları ayarlanıyor...","readyAt":null}

data: {"event":"status","status":"trial","subdomain":"demo.eticart.com.tr","message":"Mağazanız hazır!","readyAt":"2026-07-06T16:55:12.000Z"}

data: {"event":"complete","status":"trial"}
```

### 4.2 Tenant Status (zaten vardı, güncellendi)

```http
GET /api/v1/onboarding/status/:slug

→ 200 OK
{
  "status": "trial",
  "subdomain": "demo.eticart.com.tr",
  "message": "Mağazanız hazır! 14 gün ücretsiz deneyebilirsiniz.",
  "readyAt": "2026-07-06T16:55:12.000Z"
}
```

---

## 5. Mimari Kararlar

### 5.1 Reserved Subdomain Listesi
Önceden tanımlanmış subdomain'ler (`www`, `api`, `super`, vb.) tenant olarak kullanılamaz. Bu, marketing site, API gateway ve platform yönetim endpoint'lerinin çakışmasını önler.

### 5.2 Caddy Tercih Edilmesi
- **Wildcard SSL**: Let's Encrypt + DNS-01 challenge otomatik
- **Config simplicity**: 30 satır config ile reverse proxy + SSL + rate limit
- **Auto-renewal**: 60 gün otomatik, müdahale yok
- **Alternatifler**: Traefik (daha karmaşık), Nginx (wildcard için certbot script)

### 5.3 In-Memory Cache
- Tenant çözümleme her istekte DB sorgusu yerine 5 dakika cache
- Cache invalidation: tenant güncellendiğinde `invalidate(host)`
- Production'da Redis cache'e geçiş mümkün (tenant yüksek traffic'te)

### 5.4 SSE vs WebSocket
- Provisioning durumu tek yönlü (server → client)
- SSE yeterli, WebSocket overkill
- SSE otomatik reconnection, HTTP/2 uyumlu

### 5.5 Dry-Run Mode
- `STORAGE_DRY_RUN=true` veya `DNS_DRY_RUN=true` ile gerçek API çağrıları atlanır
- Development/test ortamı için
- Production'da **mutlaka false** olmalı

### 5.6 Custom Domain Doğrulama
- CNAME ile `tenant.eticart.com.tr`'ye yönlendirme
- TXT kaydı ile domain sahipliği doğrulama (`_eticart-verify.magaza.example.com`)
- Doğrulama sonrası `verified` status
- Caddy otomatik per-domain SSL cert alır

---

## 6. Veritabanı Şeması (Güncelleme)

`tenant_settings.settings` JSONB kolonuna eklenecekler:

```jsonb
{
  "storageBucket": "eticart-demo",
  "subdomain": "demo.eticart.com.tr"
}
```

---

## 7. Test Sonuçları

### Yeni Testler

| Test Dosyası | Sayı | Sonuç |
|------|-----|-----|
| `tenant-resolver.test.ts` | 15 | ✅ |
| `provisioning.steps.test.ts` | 6 | ✅ |
| `onboarding.controller.test.ts` | 6 | ✅ |
| **Sprint 15 yeni** | **27** | **✅** |

**Tenant Resolver (15 test):**
1. ✅ Tenant subdomain → tenant_id set eder
2. ✅ Olmayan subdomain → 404
3. ✅ 6 reserved subdomain bypass
4. ✅ 3 public path bypass
5. ✅ Custom domain → tenant_id set eder
6. ✅ Cache: aynı host 2. çağrıda DB sorgusu yapmaz
7. ✅ Cache: invalidate() çalışır
8. ✅ X-Forwarded-Host doğru parse

**Provisioning Steps (6 test):**
1. ✅ create_storage_bucket dry-run
2. ✅ create_storage_bucket gerçek mod
3. ✅ create_storage_bucket olmayan tenant
4. ✅ setup_subdomain_dns dry-run
5. ✅ setup_subdomain_dns gerçek mod
6. ✅ Step sırası (storage → DNS)

**Onboarding Controller (6 test):**
1. ✅ signup başarılı
2. ✅ signup hata throw
3. ✅ status endpoint
4. ✅ status invalid slug
5. ✅ verifyEmail endpoint
6. ✅ SSE stream headers

---

## 8. Tüm Proje Test Özeti (Faz 15 sonrası)

| Paket | Test | Sonuç |
|------|------|-------|
| commerce-backend | 153 + 1 skip | ✅ |
| **control-plane** | **42** (yeni) | **✅** |
| storefront | 59 | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **426+** ✅ | **+27 yeni** |

---

## 9. Dosya Yapısı (Faz 15)

```
apps/control-plane/src/
├── onboarding/
│   ├── onboarding.controller.ts       # ✏️ + SSE stream endpoint
│   ├── onboarding.service.ts          # ✏️ + provisioning tetikleme
│   ├── onboarding.repository.ts
│   ├── onboarding.module.ts           # ✏️ + ProvisioningModule
│   └── __tests__/
│       └── onboarding.controller.test.ts # 🆕 6 test
│
├── tenants/
│   ├── tenant-resolver.middleware.ts  # 🆕 Host → tenant çözümleme
│   ├── tenants.service.ts
│   ├── tenants.repository.ts
│   └── __tests__/
│       └── tenant-resolver.test.ts    # 🆕 15 test
│
├── provisioning/
│   ├── provisioning.service.ts        # ✏️ + 2 yeni step
│   ├── provisioning.module.ts
│   └── __tests__/
│       └── provisioning.steps.test.ts # 🆕 6 test
│
└── plans/
    └── plans.controller.ts            # Sprint 14'den

infra/
└── caddy/
    └── Caddyfile                      # 🆕 Wildcard SSL config

DEPLOYMENT.md                          # ✏️ + Bölüm 7.5 (Subdomain & SSL)
```

---

## 10. Production Checklist

### Coolify / Cloudflare Setup

- [ ] Wildcard DNS kaydı (`*.eticart.com.tr` → server IP)
- [ ] Cloudflare proxy aktif (orange cloud)
- [ ] Cloudflare API token (DNS edit yetkisi)
- [ ] Caddy `CLOUDFLARE_API_TOKEN` env
- [ ] `LETSENCRYPT_EMAIL` env (admin email)
- [ ] `ETICART_BASE_DOMAIN` env

### Storage / DNS Dry-Run

- [ ] Development'ta `STORAGE_DRY_RUN=true`, `DNS_DRY_RUN=true`
- [ ] Production'da her ikisi `false`
- [ ] R2/S3 API credentials configured

### Reserved Subdomain Çakışması

- [ ] Tenant signup'ında slug reserved list kontrol eder
- [ ] `www`, `api`, `admin`, `super` rezerve
- [ ] Custom domain ekleme çalışır

### Monitoring

- [ ] Caddy log aggregation
- [ ] SSL yenileme alertleri
- [ ] Tenant resolution latency (Redis cache hit ratio)

---

## 11. Sonraki Sprintler

### Faz 16 — Stripe/iyzico Billing (7-10 gün)
- Plan upgrade/downgrade akışı
- Stripe webhook handler
- iyzico entegrasyonu (Türkiye)
- Otomatik fatura oluşturma
- Trial → active dönüşümü

### Faz 17 — Super Admin Panel (5-7 gün)
- MRR/ARR dashboard
- Tenant yönetim
- Plan yönetim
- Platform metrics

### Faz 18 — Plugin Marketplace (10+ gün)
- Plugin mimarisi
- Pazaryeri adaptörleri
- Özel ödeme gateway'leri

---

*Son güncelleme: 2026-07-06 — Faz 15 Provisioning*
*Toplam: 41+ Faz, 426+ test*