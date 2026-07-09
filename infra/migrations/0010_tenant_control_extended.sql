-- =====================================================================
-- Faz 2 — Tenant, Lisans, Domain, Paket, Özellik, Denetim
--
-- Faz 1'in `0001_control_schema.sql` dosyasını genişletir; var olan
-- tablolar korunur, eksik alanlar ve yeni tablolar eklenir.
--
-- Tablolar:
--   public.tenants                  (Faz 1) + status enum genişletildi
--   public.tenant_domains           (Faz 1) + verification_token + doğrulama durumu
--   public.tenant_subscriptions     (yeni)
--   public.subscription_plans       (yeni)
--   public.plan_features            (yeni)
--   public.tenant_features          (yeni)
--   public.tenant_usage             (yeni)
--   public.tenant_settings          (yeni)
--   public.tenant_provision_jobs    (yeni)
--   public.tenant_status_history    (yeni)
--   public.licenses                 (yeni)
--   public.license_activations      (yeni)
--   public.audit_logs               (yeni)
-- =====================================================================

-- ----- 1. tenants: status enum genişletildi -----
ALTER TABLE public.tenants
    ALTER COLUMN status DROP DEFAULT;

-- Yeni status enum: draft, provisioning, trial, active, suspended,
-- overdue, cancelled, archived, provisioning_failed
DO $$
BEGIN
    -- Eski kısıt varsa kaldır
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenants_status_check'
    ) THEN
        ALTER TABLE public.tenants DROP CONSTRAINT tenants_status_check;
    END IF;
END $$;

ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_status_check CHECK (
        status IN (
            'draft',
            'provisioning',
            'trial',
            'active',
            'suspended',
            'overdue',
            'cancelled',
            'archived',
            'provisioning_failed'
        )
    );

ALTER TABLE public.tenants
    ALTER COLUMN status SET DEFAULT 'draft';

-- Yeni kolonlar (idempotent ekleme)
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS trial_end_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
    ADD COLUMN IF NOT EXISTS region TEXT,
    ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'tr-TR',
    ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY',
    ADD COLUMN IF NOT EXISTS owner_email_masked TEXT,
    ADD COLUMN IF NOT EXISTS tax_id_masked TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone_masked TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS tenants_trial_end_idx ON public.tenants (trial_end_at);
CREATE INDEX IF NOT EXISTS tenants_region_idx ON public.tenants (region);

-- ----- 2. tenant_domains: doğrulama alanları -----
ALTER TABLE public.tenant_domains
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'subdomain'
        CHECK (type IN ('subdomain', 'custom')),
    ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'verified', 'failed')),
    ADD COLUMN IF NOT EXISTS verification_token TEXT,
    ADD COLUMN IF NOT EXISTS verification_method TEXT
        CHECK (verification_method IS NULL OR verification_method IN ('dns_txt', 'dns_cname')),
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tenant_domains_verification_status_idx
    ON public.tenant_domains (verification_status);

-- ----- 3. subscription_plans: paket tanımı -----
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    monthly_price_kurus BIGINT NOT NULL DEFAULT 0 CHECK (monthly_price_kurus >= 0),
    yearly_price_kurus BIGINT NOT NULL DEFAULT 0 CHECK (yearly_price_kurus >= 0),
    currency TEXT NOT NULL DEFAULT 'TRY',
    trial_days INTEGER NOT NULL DEFAULT 14 CHECK (trial_days >= 0),
    max_users INTEGER NOT NULL DEFAULT 1 CHECK (max_users > 0),
    max_products INTEGER NOT NULL DEFAULT 100 CHECK (max_products > 0),
    max_orders_per_month INTEGER NOT NULL DEFAULT 1000 CHECK (max_orders_per_month > 0),
    max_storage_bytes BIGINT NOT NULL DEFAULT (1024 * 1024 * 1024) CHECK (max_storage_bytes >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscription_plans_active_idx
    ON public.subscription_plans (is_active, sort_order);

-- ----- 4. plan_features: pakete dahil özellikler -----
CREATE TABLE IF NOT EXISTS public.plan_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    limit_value BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, feature_key)
);

CREATE INDEX IF NOT EXISTS plan_features_plan_idx
    ON public.plan_features (plan_id);

CREATE INDEX IF NOT EXISTS plan_features_key_idx
    ON public.plan_features (feature_key);

-- ----- 5. tenant_subscriptions: aktif abonelik kaydı -----
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'expired')),
    billing_cycle TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing_cycle IN ('monthly', 'yearly')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    trial_end_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    external_subscription_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenant_subscriptions_tenant_idx
    ON public.tenant_subscriptions (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_subscriptions_status_idx
    ON public.tenant_subscriptions (status);

CREATE INDEX IF NOT EXISTS tenant_subscriptions_period_end_idx
    ON public.tenant_subscriptions (current_period_end);

-- ----- 6. tenant_features: tenant bazlı override -----
CREATE TABLE IF NOT EXISTS public.tenant_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    limit_value BIGINT,
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('plan', 'manual', 'trial', 'promotion')),
    expires_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS tenant_features_tenant_idx
    ON public.tenant_features (tenant_id);

-- ----- 7. tenant_usage: kullanım sayaçları -----
CREATE TABLE IF NOT EXISTS public.tenant_usage (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    users_count INTEGER NOT NULL DEFAULT 0 CHECK (users_count >= 0),
    products_count INTEGER NOT NULL DEFAULT 0 CHECK (products_count >= 0),
    orders_count INTEGER NOT NULL DEFAULT 0 CHECK (orders_count >= 0),
    storage_bytes BIGINT NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0),
    last_recalculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----- 8. tenant_settings: tenant bazlı ayarlar -----
CREATE TABLE IF NOT EXISTS public.tenant_settings (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    invoice_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    kvkk_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    email_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    shipping_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    feature_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    custom_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----- 9. tenant_provision_jobs: provision işlemi kayıtları -----
CREATE TABLE IF NOT EXISTS public.tenant_provision_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    current_step TEXT,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE,
    triggered_by TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenant_provision_jobs_tenant_idx
    ON public.tenant_provision_jobs (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_provision_jobs_status_idx
    ON public.tenant_provision_jobs (status);

CREATE INDEX IF NOT EXISTS tenant_provision_jobs_next_retry_idx
    ON public.tenant_provision_jobs (next_retry_at)
    WHERE status = 'failed';

-- ----- 10. tenant_status_history: durum değişikliği geçmişi -----
CREATE TABLE IF NOT EXISTS public.tenant_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    actor_id UUID,
    actor_type TEXT NOT NULL DEFAULT 'system'
        CHECK (actor_type IN ('system', 'super_admin', 'tenant_owner', 'api')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenant_status_history_tenant_idx
    ON public.tenant_status_history (tenant_id, created_at DESC);

-- ----- 11. licenses: lisans anahtarları -----
CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    license_key_hash TEXT NOT NULL UNIQUE,
    license_key_last4 TEXT NOT NULL,
    product_code TEXT NOT NULL DEFAULT 'eticart-platform',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    max_activations INTEGER NOT NULL DEFAULT 1 CHECK (max_activations > 0),
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS licenses_tenant_idx ON public.licenses (tenant_id);
CREATE INDEX IF NOT EXISTS licenses_status_idx ON public.licenses (status);
CREATE INDEX IF NOT EXISTS licenses_expires_idx ON public.licenses (expires_at);

-- ----- 12. license_activations: lisans aktivasyon kayıtları -----
CREATE TABLE IF NOT EXISTS public.license_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    instance_id TEXT,
    instance_host TEXT,
    user_agent TEXT,
    ip_masked TEXT,
    revoked_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS license_activations_license_idx
    ON public.license_activations (license_id);

CREATE INDEX IF NOT EXISTS license_activations_tenant_idx
    ON public.license_activations (tenant_id);

-- ----- 13. audit_logs: süper admin işlemleri (append-only) -----
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id UUID,
    actor_email_masked TEXT,
    actor_type TEXT NOT NULL DEFAULT 'super_admin'
        CHECK (actor_type IN ('super_admin', 'tenant_admin', 'system', 'api')),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    before_state JSONB,
    after_state JSONB,
    ip_masked TEXT,
    user_agent TEXT,
    request_id TEXT,
    correlation_id TEXT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON public.audit_logs (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx
    ON public.audit_logs (resource_type, resource_id, occurred_at DESC);

-- ----- 14. idempotency anahtarları (HTTP idempotent uçlar için) -----
CREATE TABLE IF NOT EXISTS public._idempotency_keys (
    key TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (key, action)
);

CREATE INDEX IF NOT EXISTS _idempotency_keys_resource_idx
    ON public._idempotency_keys (resource_id);

-- ----- 15. updated_at trigger fonksiyonu -----
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'tenants',
        'tenant_subscriptions',
        'tenant_features',
        'tenant_usage',
        'tenant_settings',
        'tenant_provision_jobs',
        'subscription_plans',
        'licenses'
    ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS %1$s_set_updated_at ON public.%1$s;
             CREATE TRIGGER %1$s_set_updated_at
             BEFORE UPDATE ON public.%1$s
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
            t
        );
    END LOOP;
END $$;