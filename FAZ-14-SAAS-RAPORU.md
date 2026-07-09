# Faz 14 — SaaS Self-Serve Onboarding & Public APIs

**Tarih:** 2026-07-06
**Süre:** ~3 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Eticart'ı birden fazla şirkete **satılabilir SaaS** haline getirmek için:
- ✅ Self-serve tenant kayıt (mağaza açma)
- ✅ Public pricing endpoint (landing page)
- ✅ Onboarding akışı (email doğrulama, trial, provisioning)
- ✅ Rate limiting (5 signup/dakika)

---

## 2. Mimari

```
┌──────────────────────────────────────────────────────────────┐
│  eticart.com.tr (Marketing Site)                              │
│  /pricing → GET /api/v1/plans (Public)                       │
│  /signup  → POST /api/v1/onboarding/signup                   │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  Control Plane (apps/control-plane)                          │
│                                                              │
│  /onboarding/signup       (POST, public)                     │
│  /onboarding/status/:slug (GET,  public)                     │
│  /onboarding/verify-email (POST, public)                     │
│  /plans                   (GET,  public)                     │
│  /plans/:code             (GET,  public)                     │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  Provisioning Pipeline                                        │
│  1. Tenant oluştur (status: draft)                          │
│  2. Admin user oluştur (tenant_users tablosu)                │
│  3. Subscription oluştur (trial, 14 gün)                    │
│  4. Verification token üret (SHA-256 hash'li)               │
│  5. Welcome email kuyruğa ekle (TenantWelcomeEvent)          │
│  6. Provisioning job tetikle (Faz 15)                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. API Endpoints

### 3.1 Self-Serve Signup

```http
POST /api/v1/onboarding/signup
Content-Type: application/json

{
  "tenantName": "Yıldız Tekstil",
  "slug": "yildiz-tekstil",
  "adminEmail": "info@yildiztekstil.com",
  "adminFullName": "Ahmet Yıldız",
  "adminPassword": "Guclu!Pass2024",
  "planCode": "starter",
  "companyName": "Yıldız Tekstil A.Ş.",
  "phone": "+90 532 123 4567",
  "acceptTerms": true
}

→ 201 Created
{
  "tenantId": "9c8b4a8b-...",
  "slug": "yildiz-tekstil",
  "subdomain": "yildiz-tekstil.eticart.com.tr",
  "status": "draft",
  "trialEndsAt": "2026-07-20T16:51:25.000Z"
}
```

**Validation:**
- `slug`: 3-50 karakter, sadece `[a-z0-9-]`
- `adminPassword`: min 8, 1 küçük harf + 1 büyük harf + 1 rakam
- `acceptTerms`: true olmalı
- `phone`: E.164 veya lokal format

**Rate limit:** 5 signup/dakika (IP başına)

**Hata kodları:**
- `409`: Slug zaten kullanılıyor
- `422`: Validation hatası
- `404`: Plan kodu geçersiz

### 3.2 Public Plans Listesi

```http
GET /api/v1/plans

→ 200 OK
{
  "items": [
    {
      "code": "starter",
      "name": "Starter",
      "description": "Yeni başlayanlar için temel e-ticaret paketi.",
      "monthlyPriceKurus": 0,
      "yearlyPriceKurus": 0,
      "currency": "TRY",
      "trialDays": 14,
      "maxUsers": 2,
      "maxProducts": 100,
      "maxOrdersPerMonth": 500,
      "maxStorageBytes": 1073741824,
      "features": [
        { "key": "basic_storefront", "enabled": true, "limit": null },
        { "key": "manual_payment", "enabled": true, "limit": null }
      ]
    },
    ...
  ],
  "updatedAt": "2026-07-06T16:51:25.000Z"
}
```

### 3.3 Tenant Status (Public)

```http
GET /api/v1/onboarding/status/yildiz-tekstil

→ 200 OK
{
  "status": "trial",
  "subdomain": "yildiz-tekstil.eticart.com.tr",
  "message": "Mağazanız hazır! 14 gün ücretsiz deneyebilirsiniz.",
  "readyAt": "2026-07-06T16:55:12.000Z"
}
```

### 3.4 Email Doğrulama

```http
POST /api/v1/onboarding/verify-email
Content-Type: application/json

{ "token": "abc123...64-char-hex" }

→ 200 OK
{
  "verified": true,
  "tenantId": "9c8b4a8b-...",
  "status": "trial"
}
```

---

## 4. Tenant State Machine

```
    ┌──────────┐
    │  draft   │ (signup anı)
    └────┬─────┘
         │ triggerProvisioning()
         ▼
    ┌──────────────┐
    │ provisioning │ (subdomain + SSL + storage)
    └────┬─────────┘
         │ başarılı
         ▼
    ┌──────────┐
    │  trial   │ ← verifyEmail() (draft'tan trial'a geçiş de mümkün)
    └────┬─────┘
         │ 14 gün doldu / manuel aktivasyon
         ▼
    ┌──────────┐
    │  active  │ (ödeme alındı, üretim)
    └────┬─────┘
         │ ödeme gecikmesi
         ▼
    ┌──────────┐
    │ overdue  │ → suspended (7 gün) → cancelled
    └──────────┘
```

---

## 5. Mimari Kararlar

### 5.1 TypeScript "verbatimModuleSyntax" Uyumu
`@eticart/tsconfig/base.json` `verbatimModuleSyntax: true` kullanıyor. Control-plane modülleri CommonJS modunda çalışıyor. **Test ortamında**:
- `tsconfig.build.json` ile verbatimModuleSyntax devre dışı bırakıldı
- Test'lerdeki `setupFiles` ile harici dep'ler (axios, nodemailer) stub'landı
- `@eticart/observability/kvkk` paketi mock'landı (KVKK maskeleme)

### 5.2 EmailQueue Type-Only Import
Test ortamında `notification-adapters` paketinin tüm modüllerini (SMTP, Resend) yüklememek için `OnboardingService`'de `import type { EmailQueue }` (type-only) kullanıldı. Runtime'da zaten `CommonModule`'daki `EMAIL_QUEUE_TOKEN` provider'ından geliyor.

### 5.3 Token Güvenliği
- Verification token: 32 byte `randomBytes` (256-bit entropy)
- DB'de **hash'li** (SHA-256) saklanır
- Token URL'de `?token=...` olarak gönderilir (one-time use)
- Email doğrulama sonrası DB'den temizlenir

### 5.4 Password Hashing
- Şu an: SHA-256 (placeholder, **production'da değiştirilmeli**)
- Hedef: bcrypt(12 rounds) veya argon2id
- TODO: `bcrypt` paketi eklenecek

### 5.5 Signup Rate Limiting
- ThrottlerModule ile 5 istek/dakika (IP başına)
- Bot koruması için hCaptcha (Faz 15)

---

## 6. Veritabanı Şeması (Eklenen Kolonlar)

```sql
-- tenants tablosuna ek kolonlar
ALTER TABLE public.tenants
  ADD COLUMN verification_token VARCHAR(64),
  ADD COLUMN email_verified_at TIMESTAMPTZ;

-- tenant_users (yeni tablo)
CREATE TABLE public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);
```

> **Not:** Bu migration Faz 15'te `infra/migrations/2026_07_07_onboarding/migration.sql` olarak eklenecek.

---

## 7. Test Sonuçları

| Test Dosyası | Test Sayısı | Sonuç |
|------|-----|-----|
| `onboarding.service.test.ts` | 11 | ✅ |
| `plans.controller.test.ts` | 4 | ✅ |
| **Faz 14 yeni test** | **15** | **✅** |

**Onboarding testleri:**
1. ✅ Başarılı signup akışı
2. ✅ Mevcut slug için 409
3. ✅ Geçersiz plan kodu için 404
4. ✅ Email queue hatası signupı engellemez (fire-and-forget)
5. ✅ Mevcut tenant için status
6. ✅ Olmayan tenant için 404
7. ✅ Draft durumu için readyAt null
8. ✅ Overdue durumu için ödeme mesajı
9. ✅ Geçerli token ile status güncelleme
10. ✅ Geçersiz token için 400
11. ✅ Aktif tenant için mevcut status korunur

**Plans testleri:**
1. ✅ Plan listesini döner
2. ✅ Plan detayı döner
3. ✅ Olmayan plan için 404
4. ✅ Geçersiz plan kodu için 400

---

## 8. Tüm Proje Test Özeti (Faz 14 sonrası)

| Paket | Test | Sonuç |
|------|------|-------|
| commerce-backend | 164 + 1 skip | ✅ |
| **control-plane** | **15** (yeni) | **✅** |
| storefront | 59 | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **410+** ✅ | |

---

## 9. Dosya Yapısı (Faz 14)

```
apps/control-plane/src/
├── onboarding/                          # 🆕 Sprint 14
│   ├── onboarding.controller.ts         # Public signup/status/verify
│   ├── onboarding.service.ts            # Signup iş mantığı
│   ├── onboarding.repository.ts         # Tenant user + token DB
│   ├── onboarding.module.ts             # Throttler (5/dk) + DI
│   └── __tests__/
│       ├── onboarding.service.test.ts   # 11 test
│       └── onboarding.test-setup.ts     # axios/nodemailer stub
│
├── plans/                                # ✏️ Sprint 14
│   ├── plans.controller.ts              # 🆕 Public GET /plans
│   ├── plans.module.ts                  # ✏️ Controller eklendi
│   ├── plans.repository.ts              # mevcut
│   ├── plans.service.ts                 # mevcut
│   └── __tests__/
│       └── plans.controller.test.ts     # 🆕 4 test
│
├── common/
│   ├── common.module.ts                 # ✏️ EMAIL_QUEUE_TOKEN provider
│   ├── zod-validation.pipe.ts           # 🆕 Zod validation pipe
│   ├── logger.ts
│   └── correlation-id.middleware.ts
│
├── app.module.ts                        # ✏️ PlansModule + OnboardingModule
├── tsconfig.build.json                  # 🆕 verbatimModuleSyntax: false
└── vitest.config.ts                     # 🆕 Test config + aliases

packages/notification-adapters/src/common/
└── types.ts                             # ✏️ TenantWelcomeEvent eklendi
```

---

## 10. Sprint 14 Sonuçları — Özet

| Özellik | Durum |
|---------|-------|
| Self-serve signup | ✅ |
| Public pricing API | ✅ |
| Tenant status sorgu | ✅ |
| Email doğrulama | ✅ |
| Trial subscription (14 gün) | ✅ |
| Welcome email kuyruğu | ✅ |
| Rate limiting (5/dk) | ✅ |
| 15 yeni unit test | ✅ |
| **Type-safe Zod validation** | ✅ |
| **Fire-and-forget email** | ✅ |
| **Multi-layer error handling** | ✅ |

---

## 11. Sonraki Sprintler (Roadmap)

### Faz 15 — Wildcard SSL + Subdomain Provisioning (5-7 gün)
- [ ] Caddy / Traefik reverse proxy (Let's Encrypt wildcard)
- [ ] Subdomain → tenant_id resolver middleware
- [ ] Storage bucket oluşturma (per-tenant R2/S3)
- [ ] DNS automation (Cloudflare API)

### Faz 16 — Stripe/iyzico Billing (7-10 gün)
- [ ] Ödeme entegrasyonu (Stripe, iyzico, PayTR, Param)
- [ ] Webhook handler (payment_intent.succeeded vb.)
- [ ] Fatura oluşturma (e-Fatura entegrasyonu)
- [ ] Plan upgrade/downgrade
- [ ] Trial → active dönüşümü
- [ ] Invoices listing

### Faz 17 — Super Admin Panel (5-7 gün)
- [ ] Platform-level dashboard
- [ ] Tenant yönetim (CRUD, suspend, archive)
- [ ] Plan yönetim (CRUD)
- [ ] Gelir raporları (MRR, ARR, churn)
- [ ] Destek talepleri (ticket sistemi)

### Faz 18 — Plugin Marketplace (10+ gün)
- [ ] Plugin mimarisi (slot-based, sandboxed)
- [ ] Marketplace UI
- [ ] Ödeme + lisans sistemi
- [ ] Trendyol/Hepsiburada/N11 adaptörleri
- [ ] Özel ödeme gateway'leri

### Faz 19 — White-Label (5-7 gün)
- [ ] Custom domain (CNAME)
- [ ] Özel logo, renk, font
- [ ] Özelleştirilebilir CSS variables
- [ ] Tenant-specific email templates

### Faz 20 — Analytics & Reporting (5 gün)
- [ ] Per-tenant analytics dashboard
- [ ] Conversion funnel
- [ ] Product performance
- [ ] Customer cohort analysis

---

## 12. Sektör Karşılaştırması

| Özellik | Eticart | Shopify | Ticimax | IdeaSoft |
|---------|---------|---------|---------|----------|
| Self-serve signup | ✅ (S14) | ✅ | ❌ | ❌ |
| Trial (14 gün) | ✅ (S14) | ✅ | ❌ | ❌ |
| Public pricing | ✅ (S14) | ✅ | ❌ | ❌ |
| Wildcard subdomain | 🔜 (S15) | ✅ | ❌ | ❌ |
| Stripe/iyzico | 🔜 (S16) | ✅ | ✅ | ✅ |
| White-label | 🔜 (S19) | ✅ | ❌ | ❌ |
| Plugin marketplace | 🔜 (S18) | ✅ | ❌ | ❌ |
| Multi-language | ✅ (S13) | ✅ | ✅ | ✅ |
| e-Fatura (GİB) | ✅ (S10C) | ❌ | ✅ | ✅ |

**Rekabet avantajı:** e-Fatura + açık kaynak + self-host seçeneği + uygun fiyat.

---

*Son güncelleme: 2026-07-06 — Faz 14 SaaS Onboarding*
*Toplam: 41 Faz, 410+ test*