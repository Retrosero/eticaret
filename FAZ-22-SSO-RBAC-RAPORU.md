# Faz 22 — Super Admin SSO + RBAC

**Tarih:** 2026-07-07
**Süre:** ~3 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Super admin paneline **güvenli SSO girişi** ve **rol bazlı yetkilendirme (RBAC)** eklemek.

- ❌ Eski: Basit token (env fallback)
- ✅ Yeni: Google + Microsoft OAuth2 + cookie-based session + RBAC

---

## 2. Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│  Super Admin UI (Next.js, port 3003)                            │
│  /login            → SSO seçim ekranı                            │
│  /login/callback   → OAuth callback handler                      │
│  /dashboard, /tenants, /plans, ... → sa_token cookie ile        │
└────────────────────────┬────────────────────────────────────────┘
                         │ httpOnly cookie (sa_token)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Control-Plane (NestJS)                                          │
│  /sso/google/login     → OAuth URL                                │
│  /sso/google/callback  → Code → session                          │
│  /sso/microsoft/login  → OAuth URL                                │
│  /sso/microsoft/callback → Code → session                         │
│  /sso/logout           → Cookie temizle, session revoke           │
│  /sso/me               → Mevcut user (RBAC: kendi role)           │
│  /admin/users          → Admin listesi (admin.list)               │
│  /admin/users          POST → Yeni admin (admin.create)           │
│  /admin/users/:id/role PATCH → Role değiştir (admin.role.assign)  │
│  /admin/users/:id      DELETE → Pasif et (admin.delete)           │
│  /admin/sessions       → Aktif session'lar (admin.list)           │
│  /admin/sessions/:id/revoke → Session kapat (admin.delete)         │
└─────────────────────────────────────────────────────────────────┘
         │                              │
         │ OAuth2                        │ pg.Pool
         ▼                              ▼
   Google / Microsoft             PostgreSQL
   OAuth Provider                 (super_admin_users,
                                   super_admin_sessions)
```

### OAuth Akışı:

```
1. User /login'a tıklar
   ↓
2. UI fetch → GET /sso/google/login?redirect_uri=...
   ↓
3. Server returns: { url: "https://accounts.google.com/..." }
   ↓
4. Browser → Google OAuth (email, password)
   ↓
5. Google → /login/callback?code=xyz&provider=google
   ↓
6. UI fetch → GET /sso/google/callback?code=xyz&redirect_uri=...
   ↓
7. Server:
   a. Code → access_token (POST oauth2.googleapis.com/token)
   b. access_token → user_info (GET googleapis.com/oauth2/v3/userinfo)
   c. Allowlist check (SUPER_ADMIN_ALLOWLIST env)
   d. upsert super_admin_users (default role: viewer)
   e. INSERT super_admin_sessions (token_hash, expires_at)
   f. SET cookie sa_token (httpOnly, secure, 8 saat)
   ↓
8. UI → /dashboard (artık protected route)
```

---

## 3. RBAC Sistemi

### 3.1 Roller (6 adet)

| Rol | Açıklama | Permissions |
|-----|----------|-------------|
| `super_owner` | Tam yetki (süper admin sahibi) | ALL_PERMISSIONS (wildcard) |
| `super_admin` | Tüm platform aksiyonları | 28 permission |
| `support_agent` | Sadece ticket yönetimi | 7 permission |
| `finance` | Plan, subscription, refund | 9 permission |
| `developer` | Debug, log, settings | 5 permission |
| `viewer` | Sadece okuma (read-only) | 4 permission |

### 3.2 Permission Kategorileri (28 adet)

```
tenant.list, tenant.read, tenant.suspend, tenant.reactivate,
tenant.archive, tenant.delete

plan.list, plan.create, plan.update, plan.deactivate

subscription.list, subscription.read, subscription.cancel,
subscription.refund

audit.read

analytics.read

support.ticket.read, support.ticket.respond, support.ticket.assign,
support.ticket.close, support.stats.read

admin.list, admin.create, admin.update, admin.delete,
admin.role.assign

settings.read, settings.update

plugin.approve, plugin.reject
```

### 3.3 Decorator API

```typescript
// Tek permission
@RequirePermission('tenant.suspend')
@UseGuards(PermissionGuard)
@Post('tenants/:id/suspend')
async suspend() { ... }

// OR (en az biri)
@RequireAnyPermission('admin.create', 'admin.update')
@UseGuards(PermissionGuard)
@Post('admin/users')
async create() { ... }

// AND (hepsi)
@RequireAllPermissions('tenant.suspend', 'plan.deactivate')
@UseGuards(PermissionGuard)
@Delete('plans/:code')
async deletePlan() { ... }
```

### 3.4 Permission Guard Akışı

```
1. Request gelir
2. @RequirePermission() metadata reflection ile permission çekilir
3. Cookie'den sa_token alınır
4. Token SHA256 hash'lenip DB'de session aranır
5. Session varsa → user.role çekilir
6. hasPermission(role, required) kontrol edilir
7. Yetki yoksa → 403 Forbidden (ApiError + ErrorCode.FORBIDDEN)
```

---

## 4. Veritabanı

```sql
-- Super admin user (yeni SSO'da gelen kullanıcı)
CREATE TABLE public.super_admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'viewer'
    CHECK (role IN (
      'super_owner', 'super_admin', 'support_agent',
      'finance', 'developer', 'viewer'
    )),
  sso_provider VARCHAR(20) NOT NULL
    CHECK (sso_provider IN ('google', 'microsoft', 'local')),
  sso_subject VARCHAR(255),         -- Google/M365 sub claim
  picture TEXT,
  email_verified BOOLEAN DEFAULT false,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret VARCHAR(255),   -- encrypted TOTP secret
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aktif session'lar (token SHA256 hash)
CREATE TABLE public.super_admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES super_admin_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,   -- SHA256 hex
  ip INET,
  user_agent TEXT,
  two_factor_verified BOOLEAN DEFAULT false,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_active
  ON public.super_admin_sessions(user_id, revoked_at, expires_at);
CREATE INDEX idx_users_email
  ON public.super_admin_users(email);
```

---

## 5. Environment Variables

```bash
# .env (control-plane)
GOOGLE_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
MS_CLIENT_ID=00000000-0000-0000-0000-000000000000
MS_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxx

# Comma-separated allowlist (boş bırakılırsa herkes erişir)
SUPER_ADMIN_ALLOWLIST=admin@eticart.com.tr,founder@eticart.com.tr

# Session süresi (sabit 8 saat, .env'den değiştirilebilir)
SUPER_ADMIN_SESSION_TTL_HOURS=8
```

---

## 6. API Endpoint'leri (Sprint 22)

### SSO

```http
GET  /sso/google/login?redirect_uri=https://super.eticart.com.tr/login/callback
  → { url: "https://accounts.google.com/o/oauth2/v2/auth?..." }

GET  /sso/google/callback?code=xyz&redirect_uri=...
  → Set-Cookie: sa_token=...
  → { user: { id, email, fullName, role, ... }, sessionId: "..." }

GET  /sso/microsoft/login?redirect_uri=...
GET  /sso/microsoft/callback?code=xyz&redirect_uri=...

POST /sso/logout
  → Cookie temizle + session revoke

GET  /sso/me
  → { id, email, role, permissions: [...] }
```

### Admin Yönetimi

```http
GET   /admin/users           → Super admin listesi
POST  /admin/users           → Yeni admin oluştur (email, fullName, role)
PATCH /admin/users/:id/role  → Rol değiştir
DELETE /admin/users/:id      → Admin'i pasif et

GET   /admin/sessions?userId=...
POST  /admin/sessions/:id/revoke  → Session kapat
```

---

## 7. Dosya Yapısı

```
apps/control-plane/src/admin/                  # 🆕
├── rbac.types.ts                              # 5.2 KB (6 rol, 28 permission)
├── permission.guard.ts                        # 2.9 KB (decorator + guard)
├── sso.service.ts                             # 11.3 KB (Google + Microsoft)
├── admin.controller.ts                        # 7.3 KB (SSO + admin endpoints)
├── admin.module.ts
└── __tests__/rbac.test.ts                     # 27 test

apps/super-admin/src/app/login/                # 🆕
├── page.tsx                                   # 4.1 KB — SSO seçim ekranı
└── callback/page.tsx                          # 2.2 KB — OAuth callback
```

---

## 8. Test Sonuçları

### Yeni Testler (27)

| Test Grubu | Sayı | Sonuç |
|------------|------|-------|
| `rbac.test.ts → RBAC` | 14 | ✅ |
| `rbac.test.ts → SsoService` | 13 | ✅ |

**Kapsam:**
- **RBAC hasPermission**: 6 rol × 28 permission = hepsi test
- **RBAC hasAllPermissions**: AND kontrolü, boş array edge case
- **RBAC hasAnyPermission**: OR kontrolü, hiç yoksa false
- **RBAC getPermissions**: super_owner tüm, subset kuralı
- **RBAC consistency**: role mapping bütünlüğü, ALL_PERMISSIONS'dan subset
- **SsoService.getGoogleLoginUrl**: CLIENT_ID yoksa 503, varsa URL
- **SsoService.getMicrosoftLoginUrl**: aynı mantık
- **SsoService.handleCallback**: secret yoksa 503
- **SsoService.resolveSession**: token yoksa null, varsa session
- **SsoService.revokeSession**: revoke edilen true, olmayan false
- **SsoService.listUserSessions**: aktif session listesi

### Tüm Proje Test Özeti

| Paket | Test | Sonuç |
|-------|------|-------|
| commerce-backend | **208** | ✅ |
| control-plane | **90** | ✅ (+27) |
| storefront | 59 | ✅ |
| plugin-sdk | 19 | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **548+** ✅ | **+27 yeni** |

---

## 9. Güvenlik Notları

- ✅ **Allowlist**: `SUPER_ADMIN_ALLOWLIST` env değişkeni ile kısıtlı
- ✅ **Default role = viewer**: Yeni gelen user otomatik tam yetki alamaz
- ✅ **SHA256 token hash**: DB'de raw token yok
- ✅ **httpOnly cookie**: JS erişemez (XSS koruması)
- ✅ **secure cookie**: HTTPS-only (prod)
- ✅ **sameSite=strict**: CSRF koruması
- ✅ **Session TTL 8 saat**: Kısa ömür
- ✅ **Audit log**: Login + role değişikliği logger.info ile
- ✅ **Session revoke**: Logout + admin force-revoke
- ⏳ **2FA zorunluluğu (Faz 22.5)**: TOTP enforcement, optional şimdilik

---

## 10. Production Checklist

- [x] Google OAuth2 client ID + secret
- [x] Microsoft OAuth2 client ID + secret
- [x] SUPER_ADMIN_ALLOWLIST env
- [x] Super admin users tablosu (migration)
- [x] Super admin sessions tablosu (migration)
- [x] HTTP-only cookie (secure in prod)
- [x] SHA256 token hash
- [x] Session TTL (8 saat)
- [x] Audit log (login, role change)
- [ ] 2FA zorunluluğu (super_admin ve super_owner için) — Faz 22.5
- [ ] IP allowlist (opsiyonel) — Faz 22.5
- [ ] Anomaly detection (şüpheli login) — Faz 22.5

---

## 11. Sprint 23+ Önerileri

| Sprint | İçerik | Süre | Öncelik |
|--------|--------|------|---------|
| **22.5** | 2FA zorunluluğu + IP allowlist + anomaly | 2 gün | 🟢 |
| **23** | Plugin sandboxing + versioning | 5 gün | 🟡 |
| **24** | Mobile app (React Native + Expo) | 14+ gün | 🟠 |
| **25** | AI destekli auto-respond (LLM) | 7 gün | 🟡 |
| **26** | Multi-region + CDN | 7 gün | 🟠 |
| **27** | Public knowledge base + search | 3 gün | 🟢 |

---

*Son güncelleme: 2026-07-07 — Faz 22 SSO + RBAC*
*Toplam: 22 Faz, 548+ test*