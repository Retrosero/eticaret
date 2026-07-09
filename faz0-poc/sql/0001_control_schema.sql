-- 0001_control_schema.sql
-- Kontrol düzlemi şeması (pg_control).
-- Bu DB'ye yalnızca süper admin ve provision scripti bağlanır.
-- Tenant verisi burada **YOKTUR**. Yalnızca tenant kataloğu ve lisans bilgisi.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tenant kataloğu
-- Her tenant bir firma/müşteridir. Bu tabloda KVKK verisi yoktur.
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug             TEXT UNIQUE NOT NULL,
    primary_domain   TEXT UNIQUE NOT NULL,
    schema_name      TEXT UNIQUE NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'suspended', 'deleted')),
    plan             TEXT NOT NULL DEFAULT 'starter'
                      CHECK (plan IN ('starter', 'pro', 'enterprise')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Birden fazla domain bir tenant'a eşlenebilir (örn. www + kök + lokalizasyon)
CREATE TABLE IF NOT EXISTS tenant_domains (
    tenant_id        UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    domain           TEXT PRIMARY KEY,
    is_primary       BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KVKK audit trail (kontrol düzlemi)
CREATE TABLE IF NOT EXISTS kvkk_audit (
    audit_id         BIGSERIAL PRIMARY KEY,
    actor            TEXT NOT NULL,
    action           TEXT NOT NULL,
    target_tenant    UUID,
    redacted_pii     JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexler
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON tenant_domains(tenant_id);

-- updated_at trigger fonksiyonu
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenants_touch ON tenants;
CREATE TRIGGER trg_tenants_touch
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
