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
