-- =====================================================================
-- Faz 0 — Kontrol düzlemi şeması
-- (faz0-poc/sql/0001_control_schema.sql'in Faz 1 monorepo'ya taşınmış hali)
--
-- Tablolar:
--  - tenants               : kiracı ana verisi
--  - tenant_domains        : domain → tenant eşlemesi
--  - users                 : super admin / tenant admin kullanıcıları (Faz 3)
--  - kvkk_audit            : KVKK denetim kayıtları
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'provisioning'
        CHECK (status IN ('provisioning','active','suspended','soft_deleted','hard_deleted')),
    plan TEXT NOT NULL DEFAULT 'starter'
        CHECK (plan IN ('starter','growth','business','enterprise')),
    primary_domain TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tenants_slug_idx ON public.tenants (slug);
CREATE INDEX IF NOT EXISTS tenants_status_idx ON public.tenants (status);

CREATE TABLE IF NOT EXISTS public.tenant_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    domain TEXT NOT NULL UNIQUE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenant_domains_tenant_idx ON public.tenant_domains (tenant_id);
CREATE INDEX IF NOT EXISTS tenant_domains_domain_idx ON public.tenant_domains (domain);

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin','tenant_owner','tenant_admin','tenant_staff')),
    tenant_id UUID REFERENCES public.tenants(id),
    password_hash TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_tenant_idx ON public.users (tenant_id);

CREATE TABLE IF NOT EXISTS public.kvkk_audit (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_type TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    subject_email_masked TEXT,
    ip_masked TEXT,
    details JSONB
);

CREATE INDEX IF NOT EXISTS kvkk_audit_occurred_idx ON public.kvkk_audit (occurred_at);
