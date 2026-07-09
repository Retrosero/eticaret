/**
 * Migration runner — `infra/migrations/*.sql` dosyalarını sırayla çalıştırır.
 *
 * Her dosya idempotent olmalı (`CREATE ... IF NOT EXISTS`, vb.).
 * İzlenen migration'lar `public._migrations` tablosunda saklanır.
 *
 * Kullanım: `pnpm -w migrate` veya `pnpm --filter @eticart/infra-scripts migrate`
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = resolve(__dirname, '..', '..', 'migrations');

interface MigrationRow {
  filename: string;
  applied_at: Date;
}

async function run(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL tanımlı değil.');
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(/* sql */ `
      CREATE TABLE IF NOT EXISTS public._migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const applied = new Map<string, Date>();
    const res = await client.query<MigrationRow>(
      'SELECT filename, applied_at FROM public._migrations',
    );
    for (const row of res.rows) applied.set(row.filename, row.applied_at);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`[migrate] ${file} çalıştırılıyor...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public._migrations (filename) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        count++;
        // eslint-disable-next-line no-console
        console.log(`[migrate] ${file} tamam.`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[migrate] Toplam ${count} migration uygulandı.`);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] başarısız:', err);
  process.exit(1);
});
