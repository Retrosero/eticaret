-- =====================================================================
-- Faz 3 — Kimlik doğrulama, RBAC, 2FA tabloları
--
-- Tablolar:
--  - users                 : süper admin + tenant_admin kullanıcıları (güncellendi)
--  - super_admin_users     : süper admin kullanıcıları (tenant_id yok)
--  - tenant_users          : tenant admin/personel kullanıcıları
--  - customers             : B2C müşteriler (storefront kaydı)
--  - company_accounts      : B2B bayi hesapları (Faz 8'de detaylanır)
--  - customer_companies    : müşteri-şirket eşleme (B2B için)
--  - roles                 : rol tanımları
--  - permissions           : atomik yetki tanımları
--  - role_permissions      : rol-izin eşleme
--  - user_roles            : kullanıcı-rol eşleme (tenant_id ile composite unique)
--  - user_custom_perms     : kullanıcıya özel ek izin
--  - sessions              : aktif oturumlar
--  - refresh_tokens        : refresh token (hash'li)
--  - two_factor_secrets    : 2FA secret + backup kodları
--  - login_attempts        : başarısız giriş denemeleri
--  - password_reset_tokens : şifre sıfırlama token'ları
--  - email_verifications   : e-posta doğrulama token'ları
--  - kvkk_consents         : KVKK izin onayları
--  - kvkk_deletion_requests: hesap silme talepleri (right to be forgotten)
-- =====================================================================

-- ---------------------------------------------------------------------
-- users: Faz 1'deki tabloyu genişlet
-- ---------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','pending_deletion','deleted'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (email);
CREATE INDEX IF NOT EXISTS users_status_idx ON public.users (status);

-- ---------------------------------------------------------------------
-- super_admin_users — süper admin kimlik alanı
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.super_admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','suspended','pending_deletion','deleted')),
    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- tenant_users — firma yönetim kullanıcıları
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','suspended','pending_deletion','deleted')),
    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone TEXT,
    last_login_at TIMESTAMPTZ,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS tenant_users_email_idx ON public.tenant_users (email);
CREATE INDEX IF NOT EXISTS tenant_users_tenant_idx ON public.tenant_users (tenant_id);

-- ---------------------------------------------------------------------
-- customers — B2C müşteriler
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','suspended','pending_deletion','deleted')),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone TEXT,
    is_b2b BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    kvkk_consent_at TIMESTAMPTZ,
    kvkk_consent_version TEXT,
    deletion_requested_at TIMESTAMPTZ,
    deletion_grace_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers (email);
CREATE INDEX IF NOT EXISTS customers_tenant_idx ON public.customers (tenant_id);
CREATE INDEX IF NOT EXISTS customers_deletion_idx ON public.customers (deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- company_accounts — B2B bayi hesapları (Faz 8'de detaylanır)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tax_number TEXT,
    tax_office TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    credit_limit NUMERIC(15,2),
    payment_terms_days INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_accounts_tenant_idx ON public.company_accounts (tenant_id);

-- B2B müşteri-şirket eşleme
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_account_id UUID REFERENCES public.company_accounts(id);
CREATE INDEX IF NOT EXISTS customers_company_idx ON public.customers (company_account_id);

-- ---------------------------------------------------------------------
-- roles — rol tanımları
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT,
    scope TEXT NOT NULL CHECK (scope IN ('super_admin','tenant','customer')),
    is_system BOOLEAN NOT NULL DEFAULT TRUE, -- sistem tarafından tanımlı
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- permissions — atomik yetki tanımları
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS permissions_category_idx ON public.permissions (category);

-- ---------------------------------------------------------------------
-- role_permissions — rol-izin eşleme
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ---------------------------------------------------------------------
-- user_roles — kullanıcı-rol eşleme
-- tenant_id NULL ise super_admin rolü; aksi halde tenant-scoped.
-- tenant_id + role_code composite unique.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type TEXT NOT NULL CHECK (user_type IN ('super_admin','tenant_user','customer')),
    user_id UUID NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
    granted_by UUID,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_type, user_id, role_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS user_roles_user_idx ON public.user_roles (user_type, user_id);

-- ---------------------------------------------------------------------
-- user_custom_permissions — kullanıcıya özel ek izin
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_custom_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type TEXT NOT NULL CHECK (user_type IN ('super_admin','tenant_user','customer')),
    user_id UUID NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id),
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    granted_by UUID,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_type, user_id, permission_id, tenant_id)
);

-- ---------------------------------------------------------------------
-- sessions — aktif oturumlar
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type TEXT NOT NULL CHECK (user_type IN ('super_admin','tenant_user','customer')),
    user_id UUID NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id),
    device_name TEXT,
    ip_address INET,
    user_agent TEXT,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON public.sessions (user_type, user_id);
CREATE INDEX IF NOT EXISTS sessions_active_idx ON public.sessions (user_id, revoked_at) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- refresh_tokens — hash'li refresh token kayıtları
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    family_id UUID NOT NULL,
    user_type TEXT NOT NULL,
    user_id UUID NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id),
    role TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_session_idx ON public.refresh_tokens (session_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON public.refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_active_idx ON public.refresh_tokens (token_hash) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- two_factor_secrets — 2FA secret + backup kodları
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.two_factor_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type TEXT NOT NULL CHECK (user_type IN ('super_admin','tenant_user','customer')),
    user_id UUID NOT NULL,
    secret_encrypted TEXT NOT NULL, -- (Faz 8+'da KMS ile şifrelenir; Faz 3'te düz metin)
    backup_codes_hash TEXT[] NOT NULL DEFAULT '{}',
    enabled_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_type, user_id)
);

-- ---------------------------------------------------------------------
-- login_attempts — giriş denemesi logu
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.login_attempts (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_type TEXT, -- NULL olabilir (email mevcut kullanıcıya ait olmayabilir)
    email_attempted TEXT, -- KVKK maskeleme uygulanır
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason TEXT, -- 'invalid_credentials','locked','rate_limited', vs.
    user_id UUID
);

CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON public.login_attempts (email_attempted, occurred_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON public.login_attempts (ip_address, occurred_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_user_idx ON public.login_attempts (user_id, occurred_at DESC);

-- ---------------------------------------------------------------------
-- password_reset_tokens — şifre sıfırlama tek-kullanımlık token
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type TEXT NOT NULL,
    user_id UUID NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON public.password_reset_tokens (user_type, user_id);

-- ---------------------------------------------------------------------
-- email_verifications — e-posta doğrulama token
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type TEXT NOT NULL,
    user_id UUID NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id),
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- kvkk_consents — KVKK izin onayları
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kvkk_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type TEXT NOT NULL,
    user_id UUID NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id),
    consent_type TEXT NOT NULL, -- 'terms','privacy','marketing','data_export'
    version TEXT NOT NULL,
    granted BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kvkk_consents_user_idx ON public.kvkk_consents (user_type, user_id);

-- ---------------------------------------------------------------------
-- kvkk_deletion_requests — hesap silme talepleri (right to be forgotten)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kvkk_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type TEXT NOT NULL,
    user_id UUID NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    grace_until TIMESTAMPTZ NOT NULL, -- 30 gün sonra hard delete
    processed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','cancelled','processed','failed')),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kvkk_deletion_requests_status_idx ON public.kvkk_deletion_requests (status, grace_until);

-- ---------------------------------------------------------------------
-- suspicious_login_alerts — şüpheli giriş kayıtları (yeni cihaz, farklı ülke)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suspicious_login_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type TEXT NOT NULL,
    user_id UUID NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id),
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    alert_type TEXT NOT NULL, -- 'new_device','new_country','unusual_hour','impossible_travel'
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    notified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS suspicious_login_user_idx ON public.suspicious_login_alerts (user_type, user_id, created_at DESC);