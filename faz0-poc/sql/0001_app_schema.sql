-- 0001_app_schema.sql
-- Uygulama (mağaza) şeması.
--
-- Bu SQL, pg_app üzerinde çalışır.
-- ADR-001 kapsamında her tenant kendi PG schema'sını alır.
-- Bu PoC'de iki örnek tenant (tenant_a, tenant_b) kullanılır.
--
-- Schema yapısı idempotent olacak şekilde tasarlanmıştır:
-- Tüm CREATE IF NOT EXISTS ile çalışır, böylece birden fazla çalıştırma
-- güvenlidir.

-- =====================================================================
-- 1. tenant_a SCHEMA (Tenant A)
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS tenant_a;

SET search_path TO tenant_a, public;

-- Müşteriler tablosu
CREATE TABLE IF NOT EXISTS tenant_a.customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,                       -- ADR-001: her tabloya tenant_id
    email         TEXT NOT NULL,
    name          TEXT NOT NULL,
    phone         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_a_customers_email UNIQUE (tenant_id, email)
);

-- Ürünler tablosu
CREATE TABLE IF NOT EXISTS tenant_a.products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    sku           TEXT NOT NULL,
    title         TEXT NOT NULL,
    price_cents   BIGINT NOT NULL CHECK (price_cents >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_a_products_sku UNIQUE (tenant_id, sku)
);

-- Siparişler tablosu
CREATE TABLE IF NOT EXISTS tenant_a.orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    customer_id   UUID NOT NULL REFERENCES tenant_a.customers(id),
    total_cents   BIGINT NOT NULL CHECK (total_cents >= 0),
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_a_orders_customer ON tenant_a.orders(customer_id);

-- KVKK audit (uygulama düzeyinde)
CREATE TABLE IF NOT EXISTS tenant_a.kvkk_audit (
    audit_id      BIGSERIAL PRIMARY KEY,
    actor         TEXT NOT NULL,
    action        TEXT NOT NULL,
    target_id     UUID,
    redacted_pii  JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 2. tenant_b SCHEMA (Tenant B)
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS tenant_b;

SET search_path TO tenant_b, public;

CREATE TABLE IF NOT EXISTS tenant_b.customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    email         TEXT NOT NULL,
    name          TEXT NOT NULL,
    phone         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_b_customers_email UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS tenant_b.products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    sku           TEXT NOT NULL,
    title         TEXT NOT NULL,
    price_cents   BIGINT NOT NULL CHECK (price_cents >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_b_products_sku UNIQUE (tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS tenant_b.orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    customer_id   UUID NOT NULL REFERENCES tenant_b.customers(id),
    total_cents   BIGINT NOT NULL CHECK (total_cents >= 0),
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_b_orders_customer ON tenant_b.orders(customer_id);

CREATE TABLE IF NOT EXISTS tenant_b.kvkk_audit (
    audit_id      BIGSERIAL PRIMARY KEY,
    actor         TEXT NOT NULL,
    action        TEXT NOT NULL,
    target_id     UUID,
    redacted_pii  JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 3. ROAD-RESERVE: Ortak bir "products" görünümü (JOIN gerekirse)
-- =====================================================================
-- Şimdilik gerek yok; ADR-001 B modeli fiziksel ayrımı tercih ediyor.
-- Bu blok bilinçli olarak boş.
