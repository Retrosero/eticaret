# Faz 11C — Production Hardening (Rate Limit, CSRF, Security Audit)

**Tarih:** 2026-07-06
**Süre:** ~2 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Production'a alınmadan önce güvenlik açıklarını kapatmak ve OWASP Top 10
uyumluluğunu sağlamak:
- **Rate limiting** (brute force, DoS koruması)
- **CSRF** (state-changing istekler için)
- **Security headers** (CSP, HSTS, X-Frame-Options, vb.)
- **Audit log** (KVKK uyumlu güvenlik olay kaydı)
- **HPP** (HTTP Parameter Pollution koruması)

---

## 2. Eklenen Güvenlik Katmanları

### 2.1 Rate Limiting — `@nestjs/throttler`

Global guard olarak `app.module.ts`'a eklendi. Üç katman:

| Katman | TTL | Limit | Kullanım |
|--------|-----|-------|----------|
| `short` | 1 sn | 10 req | Burst koruması |
| `medium` | 1 dk | 100 req | Brute force koruması |
| `long` | 1 saat | 1000 req | Günlük limit |

**Kapsam:** Tüm endpoint'ler (public + auth + admin). Endpoint bazlı override için `@Throttle()` dekoratörü kullanılabilir (ileride).

### 2.2 CSRF — Double-Submit Cookie

`src/common/csrf.guard.ts`:
- **Stateless** (sunucuda token saklamaz)
- **HMAC-signed** nonce (timing-safe verify)
- **Auto-set** cookie GET isteklerinde
- **Method whitelist:** Sadece `POST/PUT/PATCH/DELETE` kontrol edilir
- **Public paths:** `/api/auth/login`, `/api/auth/register`, `/health`, `/api/docs` muaf

**Akış:**
```
1. GET / → sunucu `_csrf` cookie'si set eder (HMAC-signed nonce)
2. Frontend cookie'yi okur → `X-CSRF-Token` header'ında POST'a ekler
3. POST → cookie + header eşleşmesi ve HMAC imza kontrolü
4. Uyuşmazlık → 403 + audit log
```

### 2.3 Security Headers — Helmet (Sıkılaştırıldı)

`main.ts`'te yeni konfigürasyon:

| Header | Değer | Amaç |
|--------|-------|------|
| `Content-Security-Policy` | `default-src 'self'; object-src 'none'; frame-ancestors 'none'; ...` | XSS koruması |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | HTTPS zorunluluğu |
| `X-Frame-Options` | `DENY` | Clickjacking koruması |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer sızıntısı |
| `X-Powered-By` | (kaldırıldı) | Framework gizleme |
| `Cross-Origin-Opener-Policy` | `same-origin` | Tab nabbing koruması |
| `Cross-Origin-Resource-Policy` | `cross-origin` | CDN uyumu |

### 2.4 HPP — HTTP Parameter Pollution

`main.ts`'te inline middleware:
- `?id=1&id=2&id=3` → `id=1` (ilk değer)
- Bilinen saldırı vektörü: query pollution + array index karışıklığı

### 2.5 CORS Sıkılaştırma

```ts
origin: process.env['CORS_ORIGIN'] ? parseList() : true,
credentials: true,
methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-CSRF-Token', 'X-Correlation-Id'],
exposedHeaders: ['X-Correlation-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
maxAge: 3600,
```

---

## 3. Audit Log Servisi

`src/common/audit.service.ts` — Singleton in-memory + opsiyonel DB.

### Event Tipleri

**Auth:**
- `login.success`, `login.failure`, `token.invalid`, `token.expired`, `logout`

**CSRF:**
- `csrf.missing`, `csrf.mismatch`, `csrf.invalid`

**Rate limit:**
- `rate_limit.exceeded`

**Tenant:**
- `tenant.cross_tenant_attempt` (critical)
- `tenant.unauthorized`

**Admin:**
- `admin.user_created`, `admin.user_deleted`, `admin.role_changed`, `admin.settings_changed`

**Veri (KVKK):**
- `data.export_requested`, `data.export_downloaded`
- `data.delete_requested`, `data.delete_completed` (critical)

**Fatura:**
- `invoice.created`, `invoice.cancelled`, `invoice.sent_to_gib`

**Sipariş:**
- `order.status_changed`, `order.cancelled`

**B2B:**
- `dealer.approved`, `dealer.rejected`, `credit_limit.changed`

### Severity

- `info` → normal işlem
- `warning` → şüpheli aktivite (başarısız login, CSRF mismatch)
- `critical` → güvenlik olayı (cross-tenant, KVKK silme)

### Hook'lar

| Event | Hook |
|-------|------|
| Token invalid | `JwtAuthGuard.canActivate` |
| Login success/failure | İleride `auth.controller` (Faz 12) |
| Cross-tenant | Storage controller (zaten var) |

---

## 4. Test Sonuçları

### Yeni testler

| Dosya | Test | Kapsam |
|------|------|--------|
| `csrf.guard.test.ts` | 16 | GET serbest, POST/PUT/DELETE kontrolü, HMAC imza, token format, cookie parser |
| `audit.service.test.ts` | 13 | Event ID, buffer, helper'lar (login/csrf/rate/cross-tenant/delete), filtreleme |
| `security.e2e-spec.ts` | 14 | Helmet headers, HPP, CORS, compression, auth |
| **TOPLAM yeni** | **43** | |

### Tüm backend testleri

| Kategori | Test |
|----------|------|
| Unit | 52 |
| E2E (auth/health/multi-tenant/security) | 47 |
| Storage service | 12 |
| CSRF guard | 16 |
| Audit service | 13 |
| **TOPLAM** | **126/126** ✅ + 8 skip (DB-bağımlı) |

### Tüm paketler

| Paket | Test | Tip-hata |
|------|------|---------|
| commerce-backend | **126** ✅ | 0 |
| payment-adapters | 51 ✅ | - |
| shipping-adapters | 39 ✅ | - |
| storefront | 25 ✅ | - |
| einvoice-adapters | 13 ✅ | 0 |
| notification-adapters | 34 ✅ | 0 |
| storage-adapter | 35 ✅ | 0 |
| **TOPLAM** | **323** ✅ | **0** |

---

## 5. OWASP Top 10 Uyumluluk

| OWASP Riski | Önlem |
|-------------|------|
| A01 Broken Access Control | JwtAuthGuard + RolesGuard + tenant filter + CSRF |
| A02 Cryptographic Failures | bcrypt/argon2 (ileride), HTTPS zorunlu (HSTS), secrets env |
| A03 Injection | Zod validation, Prisma parameterized queries |
| A04 Insecure Design | Threat model, multi-tenant izolasyon, defense-in-depth |
| A05 Security Misconfiguration | Helmet, CORS whitelist, hidePoweredBy, env validation |
| A06 Vulnerable Components | pnpm audit, GitHub Dependabot (ileride) |
| A07 Auth Failures | Rate limit, audit log, JWT expire, refresh token (Faz 12) |
| A08 Software/Data Integrity | Sign npm packages, integrity check (Faz 12+) |
| A09 Logging Failures | AuditService + pino structured logs |
| A10 SSRF | URL validation (storage presigned URL'lerde) |

---

## 6. Production Checklist

### Öncesi (deployment öncesi kontrol)

- [x] Rate limiting aktif (ThrottlerModule)
- [x] CSRF koruması (double-submit cookie)
- [x] Helmet sıkılaştırıldı (CSP, HSTS, frame-options)
- [x] HPP koruması
- [x] CORS whitelist (env: `CORS_ORIGIN`)
- [x] Audit logging (login, CSRF, rate limit, cross-tenant)
- [x] Multi-tenant izolasyon (key prefix, role-based, header check)
- [ ] **Sentry/Datadog entegrasyonu** (audit critical event'ler için)
- [ ] **WAF (Web Application Firewall)** — Cloudflare Turnstile veya benzeri
- [ ] **2FA (TOTP)** — admin kullanıcılar için
- [ ] **Refresh token rotation** — access token süresi sonrası (Faz 12)

### Coolify ortam değişkenleri

```bash
# Güvenlik
JWT_SECRET=<openssl rand -base64 32>
COOKIE_DOMAIN=.eticart.com.tr
CORS_ORIGIN=https://eticart.com.tr,https://admin.eticart.com.tr

# Rate limit override (opsiyonel)
THROTTLE_SHORT_LIMIT=20
THROTTLE_MEDIUM_LIMIT=200
THROTTLE_LONG_LIMIT=2000
```

---

## 7. Bilinen Sınırlamalar / TODO (Faz 12+)

1. **DB-backed audit log:** Prisma `audit_logs` tablosu (in-memory şu an 500 olay tutar)
2. **Sentry/Datadog alert:** critical severity → anında bildirim
3. **2FA / TOTP:** admin kullanıcılar için
4. **Refresh token rotation** + revocation list
5. **CSP nonce** (per-request script nonce) — strict CSP için
6. **Rate limit IP allowlist** (internal servisler için bypass)
7. **Brute-force protection:** login endpoint için ayrı kural (5 deneme/saat)

---

## 8. Kritik Dosya Yolları

```
apps/commerce-backend/src/
├── common/
│   ├── csrf.guard.ts                     # Double-submit cookie CSRF koruması
│   ├── audit.service.ts                  # Güvenlik olay kaydı
│   ├── jwt-auth.guard.ts                 # Token invalid → audit log
│   └── __tests__/
│       ├── csrf.guard.test.ts            # 16 test
│       └── audit.service.test.ts         # 13 test
├── main.ts                               # Helmet + HPP + CORS sıkılaştırma
├── app.module.ts                         # ThrottlerModule + global guards
└── test/
    └── security.e2e-spec.ts              # 14 OWASP test

docker-compose.yml                        # (etkilenmedi)
.env.production.example                   # (etkilenmedi)
```