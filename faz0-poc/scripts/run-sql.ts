/**
 * run-sql.ts — Verilen SQL dosyalarını sırayla uygular.
 *
 * Kullanım:
 *   tsx scripts/run-sql.ts sql/0001_control_schema.sql sql/0001_app_schema.sql ...
 *
 * Her dosya için hangi DB'ye uygulanacağı dosya adından çıkarılır:
 *   - 0001_control_schema.sql, 0002_seed_control.sql -> pg_control
 *   - 0001_app_schema.sql, rls-policies.sql           -> pg_app
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import '../src/env.js';
import pg from 'pg';
import { getAppPool, getControlPool } from '../src/db.js';

const { Pool } = pg;

async function applyToPool(sqlText: string, pool: pg.Pool, label: string): Promise<void> {
  const client = await pool.connect();
  try {
    // eslint-disable-next-line no-console
    console.log(`[${label}] SQL uygulanıyor (${sqlText.length} karakter)...`);
    await client.query(sqlText);
    console.log(`[${label}] ✓ uygulandı`);
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('En az bir SQL dosyası verin.');
    process.exit(1);
  }

  let controlPool: pg.Pool | null = null;
  let appPool: pg.Pool | null = null;

  try {
    for (const f of files) {
      const absPath = resolve(f);
      const sqlText = await readFile(absPath, 'utf8');
      const lower = f.toLowerCase();

      if (lower.includes('control') || lower.includes('seed_control')) {
        controlPool ??= getControlPool();
        await applyToPool(sqlText, controlPool, 'pg_control');
      } else if (lower.includes('app') || lower.includes('rls')) {
        appPool ??= getAppPool();
        await applyToPool(sqlText, appPool, 'pg_app');
      } else {
        // Varsayılan: app
        appPool ??= getAppPool();
        await applyToPool(sqlText, appPool, 'pg_app');
      }
    }
  } finally {
    if (controlPool) await controlPool.end();
    if (appPool) await appPool.end();
  }
  console.log('Tüm SQL dosyaları başarıyla uygulandı.');
}

main().catch((err) => {
  console.error('Hata:', err);
  process.exit(1);
});

// pg.Pool tipini runtime referansı için import et (TS strict uyumu)
export {};
