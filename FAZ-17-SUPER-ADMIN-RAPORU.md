# Faz 17 — Süper Admin Panel

**Tarih:** 2026-07-06
**Süre:** ~4 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Platform sahibinin tüm tenant'ları, planları, abonelikleri ve audit log'ları yönetebileceği **kapsamlı bir super admin paneli**.

---

## 2. Mimari

```
┌────────────────────────────────────────────────────────────────┐
│  super.eticart.com.tr (Caddy → Next.js 15)                    │
│                                                                 │
│  /login           → Token girişi (cookie auth)                │
│  /dashboard       → KPI: MRR, ARR, aktif tenant, churn         │
│  /tenants         → Filtrelenebilir tenant listesi             │
│  /tenants/[id]    → Tenant detayı, suspend/reactivate          │
│  /plans           → Plan CRUD (modal ile yeni plan)            │
│  /subscriptions   → Tüm subscription kayıtları                │
│  /audit           → Audit log sorgu (filtreli)                 │
└────────────────────┬───────────────────────────────────────────┘
                     │ Bearer token (cookie)
                     ▼
┌────────────────────────────────────────────────────────────────┐
│  Control Plane (apps/control-plane)                            │
│  /api/v1/super-admin/*                                          │
│                                                                 │
│  GET    /dashboard                                              │
│  GET    /metrics                                                │
│  GET    /tenants           (filtre, sayfalama)                 │
│  GET    /tenants/:id                                            │
│  POST   /tenants/:id/suspend                                    │
│  POST   /tenants/:id/reactivate                                 │
│  DELETE /tenants/:id        (soft delete / archive)           │
│  GET    /plans                                                   │
│  POST   /plans                                                   │
│  PATCH  /plans/:id                                               │
│  DELETE /plans/:id          (soft deactivate)                  │
│  GET    /subscriptions                                           │
│  POST   /subscriptions/:id/cancel                               │
│  GET    /audit                                                   │
└────────────────────┬───────────────────────────────────────────┘
                     │ pg.Pool
                     ▼
        PostgreSQL: tenants, subscriptions,
                    subscription_plans, audit_logs
```

---

## 3. Yeni Bileşenler

### 3.1 SuperAdminService (control-plane)

**`apps/control-plane/src/super-admin/super-admin.service.ts`** — 22 KB

**Sorumluluklar:**

| Metod | Açıklama |
|-------|----------|
| `getDashboard()` | Tüm KPI'ları tek sorguda getirir |
| `getMetrics(range)` | Zaman serisi: signups, revenue, active tenants |
| `listTenants(filter)` | Sayfalama, durum/plan/search filtreleri |
| `getTenantDetail(id)` | Tenant + subscription + kullanıcı + depolama + audit |
| `suspendTenant(id, reason)` | Askıya al + audit log |
| `reactivateTenant(id)` | Yeniden aktifleştir + audit |
| `archiveTenant(id, reason)` | Soft delete + audit |
| `listAllPlans()` | Tüm planlar (aktif + deaktif) |
| `createPlan(input)` | Yeni plan + audit |
| `updatePlan(id, input)` | Plan güncelle + audit (before/after) |
| `deactivatePlan(id)` | Soft delete + audit |
| `listSubscriptions(filter)` | Tüm subscription'lar |
| `cancelSubscription(id, reason, refund)` | İptal + audit |
| `queryAuditLog(filter)` | Filtreli audit sorgu (page, tenant, actor, action, date range) |

### 3.2 SuperAdminController (control-plane)

**`apps/control-plane/src/super-admin/super-admin.controller.ts`** — 11 KB

15 REST endpoint, Zod validation, Swagger docs, RequireSuperAdmin guard.

### 3.3 Super Admin UI (Next.js 15)

**`apps/super-admin/src/app/`**

| Sayfa | Tip | İçerik |
|-------|-----|--------|
| `/login` | Client | Bearer token girişi, cookie set |
| `/dashboard` | Server | 6 KPI kartı, plan dağılımı, son aktiviteler |
| `/tenants` | Server | Filtre, tablo, sayfalama, status badge |
| `/tenants/[id]` | Server | Tenant bilgileri, KPI, suspend butonu, audit timeline |
| `/plans` | Server | Plan kartları, create modal |
| `/subscriptions` | Server | Subscription tablosu, filtre |
| `/audit` | Server | Audit log tablosu, action/resource filtreleri |

**UI Özellikleri:**
- Dark sidebar (logo + nav)
- Server components (default) — hızlı initial load
- Client components — sadece dialog/form ihtiyaçlarında
- `requireSuperAdmin()` — her sayfada auth check
- Token-based auth (cookie)
- Responsive grid layout

### 3.4 Auth Helper

**`apps/super-admin/src/app/_lib/auth.ts`**

```ts
async function requireSuperAdmin(): Promise<void> {
  const token = await getSuperAdminToken();
  if (!token) redirect('/login');
  // Verify against control-plane
  const res = await fetch(...);
  if (!res.ok) redirect('/login');
}
```

---

## 4. API Endpoint'ler

### 4.1 Dashboard

```http
GET /api/v1/super-admin/dashboard
Authorization: Bearer <super_admin_token>

→ 200 OK
{
  "totalTenants": 37,
  "activeTenants": 25,
  "trialTenants": 10,
  "suspendedTenants": 2,
  "overdueTenants": 0,
  "mrrKurus": 1996000,
  "arrKurus": 23952000,
  "signupsLast24h": 5,
  "signupsLast7d": 15,
  "churnRate30d": 4.0,
  "storageUsedBytes": 5368709120,
  "tenantsByPlan": [
    { "planCode": "starter", "count": 20 },
    { "planCode": "growth", "count": 12 },
    { "planCode": "business", "count": 5 }
  ],
  "recentActivity": [
    {
      "tenantId": "...",
      "slug": "demo",
      "action": "tenant.create",
      "at": "2026-07-06T16:00:00.000Z"
    }
  ]
}
```

### 4.2 Metrics (Zaman Serisi)

```http
GET /api/v1/super-admin/metrics?range=30d

→ 200 OK
{
  "range": "30d",
  "signups": [
    { "date": "2026-06-06", "count": 3 },
    { "date": "2026-06-07", "count": 5 }
  ],
  "revenue": [
    { "date": "2026-06-06", "amount": 49900 }
  ],
  "activeTenants": [
    { "date": "2026-06-06", "count": 22 },
    { "date": "2026-06-07", "count": 25 }
  ]
}
```

### 4.3 Tenant List (Filtreli)

```http
GET /api/v1/super-admin/tenants?status=trial&plan=starter&search=demo&page=1&limit=20

→ 200 OK
{
  "items": [...],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

### 4.4 Tenant Askıya Alma

```http
POST /api/v1/super-admin/tenants/{id}/suspend
Authorization: Bearer <super_admin_token>
Content-Type: application/json

{ "reason": "Ödeme 60 gün gecikme" }

→ 200 OK
{ "ok": true, "tenantId": "..." }
```

### 4.5 Plan Oluşturma

```http
POST /api/v1/super-admin/plans
Authorization: Bearer <super_admin_token>
Content-Type: application/json

{
  "code": "custom-pro",
  "name": "Custom Pro",
  "description": "Özel ihtiyaçlar için",
  "monthlyPriceKurus": 299900,
  "yearlyPriceKurus": 2999000,
  "currency": "TRY",
  "trialDays": 30,
  "maxUsers": 100,
  "maxProducts": 100000,
  "maxOrdersPerMonth": 200000,
  "maxStorageBytes": 107374182400,
  "sortOrder": 25,
  "isActive": true,
  "features": []
}

→ 201 Created
{
  "plan": { "id": "...", "code": "custom-pro", ... },
  "features": []
}
```

### 4.6 Audit Log Sorgu

```http
GET /api/v1/super-admin/audit?action=tenant.create&resourceType=tenant&from=2026-07-01T00:00:00Z&to=2026-07-06T23:59:59Z

→ 200 OK
{
  "items": [
    {
      "id": "...",
      "action": "tenant.create",
      "resource_type": "tenant",
      "resource_id": "...",
      "actor_email": null,
      "tenant_slug": "demo",
      "created_at": "2026-07-06T16:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50
}
```

---

## 5. Mimari Kararlar

### 5.1 Token-Based Auth (Phase 17)
- Bearer token (cookie + header)
- Phase 18'de SSO + RBAC
- Token env variable'da (`SUPER_ADMIN_TOKEN`)

### 5.2 Server Components First
- Default server component (veri fetch + render)
- Sadece dialog/form gibi state'li UI için `'use client'`
- SEO-friendly, hızlı initial load

### 5.3 MRR Hesaplama
- Aktif + trialing subscription'lar
- Yearly plan → monthly price'a çevrilir (12'ye bölünmeden!)
- ARR = MRR × 12

### 5.4 Soft Delete Pattern
- Tenant: `status = 'archived'` (mevcut state machine)
- Plan: `isActive = false` (subscription oluşturulamaz, mevcutlar devam)
- Subscription: `status = 'cancelled'` + `cancelledAt`

### 5.5 Audit Log
- Tüm super admin aksiyonları `actor_type='super_admin'` olarak loglanır
- before/after JSON diff (plan update için)
- Değiştirilemez, KVKK uyumlu

### 5.6 Churn Rate
- Son 30 gün iptal / aktif oranı
- Yüzde olarak gösterilir (2 ondalık)
- Refund ile birlikte iptal de dahil

---

## 6. Veritabanı

Mevcut tablolar kullanıldı. Yeni tablo yok.

**Kullanılan sorgular:**

```sql
-- Tenant counts
SELECT status, COUNT(*) FROM public.tenants
WHERE status != 'archived' GROUP BY status;

-- MRR
SELECT SUM(
  CASE WHEN s.billing_cycle = 'yearly'
  THEN p.monthly_price_kurus ELSE p.monthly_price_kurus END
) FROM public.tenant_subscriptions s
INNER JOIN public.subscription_plans p ON p.id = s.plan_id
WHERE s.status IN ('active', 'trialing');

-- Churn
SELECT
  (SELECT COUNT(*) FROM tenant_subscriptions
   WHERE status = 'cancelled' AND cancelled_at > now() - interval '30 days'),
  (SELECT COUNT(*) FROM tenant_subscriptions WHERE status = 'active');

-- Active tenants per day
WITH days AS (
  SELECT generate_series(date_trunc('day', now() - interval '30 days'),
                         date_trunc('day', now()),
                         interval '1 day')::date as d
)
SELECT d, (SELECT COUNT(*) FROM tenants
           WHERE created_at <= d
             AND (archived_at IS NULL OR archived_at > d)) FROM days;
```

---

## 7. Test Sonuçları

### Yeni Testler (21)

| Test | Sayı | Sonuç |
|------|------|-------|
| `super-admin.service.test.ts` | 21 | ✅ |

**Kapsam:**
- `getDashboard()` — tüm KPI'lar, boş durum
- `getMetrics()` — range parsing (7d, 30d, 90d, 1y, invalid)
- `listTenants()` — filtresiz, search, status+plan
- `suspendTenant()` — başarı, 404
- `createPlan()` — başarı + audit
- `queryAuditLog()` — filtresiz, tenant filtresi
- `parseRangeToDays()` — private helper

### Tüm Proje Test Özeti

| Paket | Test | Sonuç |
|------|------|-------|
| commerce-backend | 153 | ✅ |
| **control-plane** | **63** (yeni) | **✅** |
| storefront | 59 | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **447+** ✅ | **+21 yeni** |

### Type Check

| Paket | TS Hatası |
|------|----------|
| apps/super-admin | 0 ✅ |
| apps/control-plane | (mevcut sorunlar) |
| apps/storefront | 0 ✅ |

### Build

```
Next.js 15.5.19 ✓ Compiled successfully
Route (app)                              Size     First Load JS
┌ ○ /                                    134 B    102 kB
├ ƒ /dashboard                           134 B    102 kB
├ ƒ /tenants                             160 B    105 kB
├ ƒ /tenants/[id]                        1.33 kB  107 kB
├ ƒ /plans                               1.84 kB  107 kB
├ ƒ /subscriptions                       166 B    105 kB
├ ƒ /audit                               166 B    105 kB
├ ○ /login                               1.32 kB  103 kB
└ ƒ /health, /ready                      134 B    102 kB
```

---

## 8. Dosya Yapısı (Faz 17)

```
apps/super-admin/src/app/
├── layout.tsx                              # ✏️ AdminShell (sidebar)
├── page.tsx                                # ✏️ /dashboard'a redirect
├── _lib/
│   └── auth.ts                             # 🆕 requireSuperAdmin, getSuperAdminToken
├── login/
│   └── page.tsx                            # 🆕 Token-based login
├── dashboard/
│   └── page.tsx                            # 🆕 6 KPI + plan dağılımı + recent activity
├── tenants/
│   ├── page.tsx                            # 🆕 Tenant listesi (filtre, tablo)
│   └── [id]/
│       ├── page.tsx                        # 🆕 Tenant detayı
│       └── SuspendButton.tsx               # 🆕 Client: askıya alma dialog
├── plans/
│   ├── page.tsx                            # 🆕 Plan kartları
│   └── CreatePlanButton.tsx                # 🆕 Client: yeni plan modal
├── subscriptions/
│   └── page.tsx                            # 🆕 Subscription tablosu
├── audit/
│   └── page.tsx                            # 🆕 Audit log viewer
├── health/route.ts                         # (mevcut)
└── ready/route.ts                          # (mevcut)

apps/control-plane/src/super-admin/
├── super-admin.module.ts                   # 🆕 SuperAdminService + Controller + Guard
├── super-admin.service.ts                  # 🆕 22 KB - tüm iş mantığı
├── super-admin.controller.ts               # 🆕 15 REST endpoint
├── super-admin.guard.ts                    # (mevcut) RequireSuperAdmin
└── __tests__/
    └── super-admin.service.test.ts         # 🆕 21 unit test
```

---

## 9. Production Checklist

- [ ] `SUPER_ADMIN_TOKEN` env değişkeni (güçlü random)
- [ ] `CONTROL_PLANE_API` env değişkeni (Next.js + Server)
- [ ] Caddy route: `super.eticart.com.tr → super-admin:3003`
- [ ] IP allowlist (production'da önerilir)
- [ ] 2FA / SSO ekleme (Phase 18)
- [ ] Rate limit (admin login attempts)
- [ ] Audit log retention (1+ yıl)
- [ ] Super admin aksiyonları için Slack/email alert

---

## 10. Sprint 18+ Önerileri

| Sprint | İçerik | Süre |
|--------|--------|------|
| **18** | Plugin marketplace + pazaryeri adaptörleri | 10+ gün |
| **19** | White-label (özel domain, tema) | 5-7 gün |
| **20** | Analytics & reporting dashboard | 5 gün |
| **21** | Help center / ticket sistemi | 3-5 gün |
| **22** | Super admin SSO (Google, Microsoft) | 3 gün |
| **23** | Super admin RBAC (sadece okuma, vb.) | 2 gün |

---

*Son güncelleme: 2026-07-06 — Faz 17 Super Admin*
*Toplam: 41+ Faz, 447+ test*