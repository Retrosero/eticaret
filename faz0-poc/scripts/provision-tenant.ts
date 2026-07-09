/**
 * provision-tenant.ts — Idempotent tenant provision scripti.
 *
 * Kullanım:
 *   tsx scripts/provision-tenant.ts <slug> [--domain=<domain>] [--plan=<plan>]
 *
 * Davranış:
 *   1. tenants tablosunda slug aranır (ON CONFLICT DO NOTHING ile upsert).
 *   2. pg_app üzerinde "tenant_<slug>" şeması oluşturulur (CREATE SCHEMA IF NOT EXISTS).
 *   3. Şemada temel tablolar CREATE TABLE IF NOT EXISTS ile oluşturulur.
 *   4. tenants tablosuna primary_domain eklenir (ON CONFLICT DO NOTHING).
 *
 * Idempotent: aynı slug ile birden fazla kez çalıştırılabilir, sonuç aynıdır.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import '../src/env.js';
import { getAppPool, getControlPool } from '../src/db.js';
import { resolveTenantBySlug } from '../src/tenant-resolver.js';
import { maskEmail } from '../src/kvkk-mask.js';

const TENANT_TEMPLATE_SQL = `
CREATE TABLE IF NOT EXISTS customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    email         TEXT NOT NULL,
    name          TEXT NOT NULL,
    phone         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customers_email UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    sku           TEXT NOT NULL,
    title         TEXT NOT NULL,
    price_cents   BIGINT NOT NULL CHECK (price_cents >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_products_sku UNIQUE (tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    customer_id   UUID NOT NULL REFERENCES customers(id),
    total_cents   BIGINT NOT NULL CHECK (total_cents >= 0),
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

CREATE TABLE IF NOT EXISTS kvkk_audit (
    audit_id      BIGSERIAL PRIMARY KEY,
    actor         TEXT NOT NULL,
    action        TEXT NOT NULL,
    target_id     UUID,
    redacted_pii  JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

function parseArgs(): { slug: string; domain: string; plan: string } {
  const args = process.argv.slice(2);
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const a of args) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) flags[a.substring(2, eq)] = a.substring(eq + 1);
      else flags[a.substring(2)] = 'true';
    } else {
      positional.push(a);
    }
  }
  const slug = positional[0];
  if (!slug) {
    console.error('Kullanım: tsx scripts/provision-tenant.ts <slug> [--domain=<domain>] [--plan=<plan>]');
    process.exit(1);
  }
  if (!/^[a-z0-9_-]+$/.test(slug)) {
    throw new Error(`Geçersiz slug: ${slug}; yalnızca [a-z0-9_-] karakterleri`);
  }
  return {
    slug,
    domain: flags['domain'] ?? `${slug}.local`,
    plan: flags['plan'] ?? 'starter',
  };
}

async function provision(): Promise<void> {
  const { slug, domain, plan } = parseArgs();
  const schemaName = `tenant_${slug.replace(/-/g, '_')}`;

  console.log(`[provision-tenant] slug=${slug} schema=${schemaName} domain=${domain} plan=${plan}`);

  // 1. Kontrol düzleminde tenant kaydı (idempotent)
  const controlPool = getControlPool();
  let tenantId: string;
  try {
    const { rows } = await controlPool.query<{ tenant_id: string }>(
      `INSERT INTO tenants (slug, primary_domain, schema_name, plan, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (slug) DO UPDATE
         SET primary_domain = EXCLUDED.primary_domain,
             plan = EXCLUDED.plan,
             updated_at = NOW()
       RETURNING tenant_id`,
      [slug, domain, schemaName, plan],
    );
    tenantId = rows[0]!.tenant_id;
    console.log(`[provision-tenant] ✓ tenants satırı: ${tenantId}`);
  } finally {
    await controlPool.end();
  }

  // 2. Domain kaydı
  const controlPool2 = getControlPool();
  try {
    await controlPool2.query(
      `INSERT INTO tenant_domains (tenant_id, domain, is_primary, verified_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (domain) DO NOTHING`,
      [tenantId, domain],
    );
    console.log(`[provision-tenant] ✓ primary_domain bağlandı`);
  } finally {
    await controlPool2.end();
  }

  // 3. Uygulama DB'de schema oluştur + tablolar
  const appPool = getAppPool();
  try {
    const client = await appPool.connect();
    try {
      // Schema IF NOT EXISTS oluştur
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
      await client.query(`SET search_path TO ${schemaName}, public`);
      await client.query(TENANT_TEMPLATE_SQL);
      // KVKK audit kaydı
      await client.query(
        `INSERT INTO ${schemaName}.kvkk_audit (actor, action, target_id)
         VALUES ('system', 'tenant.provision', $1)`,
        [tenantId],
      );
      console.log(`[provision-tenant] ✓ ${schemaName} şeması ve tablolar hazır`);
    } finally {
      client.release();
    }
  } finally {
    await appPool.end();
  }

  // 4. Kontrol düzleminde KVKK audit
  const controlPool3 = getControlPool();
  try {
    await controlPool3.query(
      `INSERT INTO kvkk_audit (actor, action, target_tenant, redacted_pii)
       VALUES ('provision-script', 'tenant.provision', $1, $2::jsonb)`,
      [tenantId, JSON.stringify({ slug })],
    );
  } finally {
    await controlPool3.end();
  }

  // 5. Doğrulama
  const resolved = await resolveTenantBySlug(slug);
  if (!resolved) throw new Error('Provision doğrulanamadı');
  console.log(`[provision-tenant] ✓ doğrulandı: tenantId=${maskEmail(resolved.tenantId)}`);

  console.log(`[provision-tenant] BİTTİ — ${slug} hazır.`);
}

provision().catch((err) => {
  console.error('[provision-tenant] HATA:', err.message);
  process.exit(1);
});

// Modül referansı için (TS strict uyumu)
export { TENANT_TEMPLATE_SQL };
// readFile referansı (seed scriptinde kullanılacak)
export async function _readSqlFile(p: string): Promise<string> {
  return readFile(resolve(p), 'utf8');
}
