/**
 * Seed runner — geliştirme ortamı için örnek veri yükler.
 *
 * Faz 1'de yalnızca `0003_seed_dev.sql` çalıştırılır (iki örnek tenant).
 * Faz 4+ ölçeğinde ürün/kategori seed'i genişletilecek.
 */

import { Client } from 'pg';

async function run(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Seed scripti üretimde çalıştırılamaz.');
  }
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL tanımlı değil.');

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const sql = `
      INSERT INTO public.tenants (slug, name, status, plan, primary_domain)
      VALUES
          ('firma-a', 'Firma A Mağazası', 'active', 'starter', 'firma-a.local'),
          ('firma-b', 'Firma B Mağazası', 'active', 'starter', 'firma-b.local')
      ON CONFLICT (slug) DO UPDATE SET updated_at = NOW();

      INSERT INTO public.tenant_domains (tenant_id, domain, is_primary)
      SELECT id, 'firma-a.local', TRUE FROM public.tenants WHERE slug = 'firma-a'
      ON CONFLICT (domain) DO NOTHING;

      INSERT INTO public.tenant_domains (tenant_id, domain, is_primary)
      SELECT id, 'firma-b.local', TRUE FROM public.tenants WHERE slug = 'firma-b'
      ON CONFLICT (domain) DO NOTHING;
    `;
    await client.query(sql);
    // eslint-disable-next-line no-console
    console.log('[seed] Geliştirme seed verisi yüklendi.');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] başarısız:', err);
  process.exit(1);
});
