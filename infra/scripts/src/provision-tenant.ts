/**
 * Tenant provision scripti.
 *
 * Slug format doğrulaması + idempotent provision + tenant şeması açma.
 * Faz 0 PoC'sindeki davranışın korunmuş hali.
 *
 * Kullanım: `tsx src/provision-tenant.ts <slug> [name] [plan]`
 */

import { Client } from 'pg';
import { createTenantSchema } from '@eticart/validation';
import { schemaNameFromSlug } from '@eticart/tenant-context';

function parseArgs(argv: string[]): { slug: string; name: string; plan: 'starter' } | null {
  if (argv.length < 1) return null;
  const [slug, name, plan] = argv;
  if (!slug || !name) return null;
  const parsed = createTenantSchema.safeParse({ slug, name, plan: plan ?? 'starter' });
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[provision] Geçersiz argüman:', parsed.error.flatten());
    return null;
  }
  return { slug: parsed.data.slug, name: parsed.data.name, plan: 'starter' };
}

async function ensureSchema(client: Client, schema: string): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

  // Şablon tablo yapıları — Faz 4'te genişletilecek
  for (const stmt of [
    `CREATE TABLE IF NOT EXISTS ${schema}.customers (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       email TEXT NOT NULL UNIQUE,
       full_name TEXT NOT NULL,
       phone TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS ${schema}.products (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       slug TEXT NOT NULL UNIQUE,
       title TEXT NOT NULL,
       description TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE TABLE IF NOT EXISTS ${schema}.kvkk_audit (
       id BIGSERIAL PRIMARY KEY,
       occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       actor_type TEXT NOT NULL,
       action TEXT NOT NULL,
       subject_email_masked TEXT,
       details JSONB
     )`,
  ]) {
    await client.query(stmt);
  }
}

async function finalizeControlTenant(slug: string, name: string): Promise<string | null> {
  const controlUrl = process.env['CONTROL_DATABASE_URL'];
  if (!controlUrl) return null;

  const client = new Client({ connectionString: controlUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const domain = `${slug}.${process.env['ETICART_BASE_DOMAIN'] ?? 'eticart.com.tr'}`;
    const tenant = await client.query<{ id: string }>(
      `INSERT INTO public.tenants (slug, name, status, plan, primary_domain, updated_at)
       VALUES ($1, $2, 'provisioning', 'starter', $3, NOW())
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
       RETURNING id`,
      [slug, name, domain],
    );
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) throw new Error('Control tenant id alınamadı.');

    await client.query(
      `INSERT INTO public.tenant_domains
         (tenant_id, domain, is_primary, verified_at, verification_status, type)
       VALUES ($1::uuid, $2, TRUE, NOW(), 'verified', 'subdomain')
       ON CONFLICT (domain) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
         is_primary = TRUE, verified_at = NOW(), verification_status = 'verified'`,
      [tenantId, domain],
    );
    await client.query(
      `INSERT INTO public.tenant_theme_assignments
         (tenant_id, theme_id, theme_version, status, overrides, activated_at, created_at, updated_at)
       SELECT $1::uuid, tv.theme_id, tv.version, 'active', '{}'::jsonb, NOW(), NOW(), NOW()
       FROM public.theme_versions tv
       WHERE tv.theme_id = 'modern' AND tv.version = '1.0.0'
         AND NOT EXISTS (
           SELECT 1 FROM public.tenant_theme_assignments a
           WHERE a.tenant_id = $1::uuid AND a.status = 'active'
         )`,
      [tenantId],
    );
    await client.query(`UPDATE public.tenants SET status = 'active', updated_at = NOW() WHERE id = $1::uuid`, [tenantId]);
    await client.query('COMMIT');
    return tenantId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    // eslint-disable-next-line no-console
    console.error('Kullanım: tsx src/provision-tenant.ts <slug> [name] [plan]');
    process.exit(1);
  }
  const schema = schemaNameFromSlug(args.slug);
  if (!schema) {
    // eslint-disable-next-line no-console
    console.error('[provision] Şema adı üretilemedi, slug güvensiz.');
    process.exit(1);
  }

  const url = process.env['DATABASE_URL'];
  if (!url) {
    // eslint-disable-next-line no-console
    console.error('[provision] DATABASE_URL tanımlı değil.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');

    const upsert = await client.query<{ id: string }>(
      `INSERT INTO public.tenants (slug, name, status, plan)
       VALUES ($1, $2, 'provisioning', $3)
       ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [args.slug, args.name, args.plan],
    );
    const tenantId = upsert.rows[0]?.id;
    if (!tenantId) throw new Error('Tenant id alınamadı.');

    await ensureSchema(client, schema);

    await client.query('COMMIT');
    await finalizeControlTenant(args.slug, args.name);
    // eslint-disable-next-line no-console
    console.log(
      `[provision] Tenant ${args.slug} hazır (id=${tenantId}, şema=${schema}).`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[provision] başarısız:', err);
  process.exit(1);
});
