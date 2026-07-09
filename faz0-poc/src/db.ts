/**
 * db.ts — Veritabanı bağlantı havuzu yardımcıları.
 *
 * İki ayrı havuz: pg_control ve pg_app.
 * Uygulama kodunda `getControlPool()` ve `getAppPool()` ile erişilir.
 *
 * Ortam değişkenlerinden okunur; .env dosyası src/env.ts tarafından yüklenir.
 */

import './env.js';
import pg from 'pg';
import { CONTROL_DATABASE_URL, APP_DATABASE_URL } from './env.js';

const { Pool } = pg;

export type PoolHandle = pg.Pool;

/**
 * Kontrol düzlemi bağlantı havuzunu döndürür.
 * pg_control içindir: tenants ve tenant_domains tabloları.
 */
export function getControlPool(): PoolHandle {
  return new Pool({
    connectionString: CONTROL_DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Uygulama (mağaza) bağlantı havuzunu döndürür.
 * pg_app içindir. Şema çözümlemesi SET search_path ile yapılır.
 */
export function getAppPool(): PoolHandle {
  return new Pool({
    connectionString: APP_DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Uygulama havuzundan bir client ödünç alır ve verilen schema'yı
 * search_path'e ekler. Yazma işlemleri bu şekilde tenant-scoped olur.
 *
 * @param schemaName tenant şema adı (örn. "tenant_a")
 */
export async function withAppClient<T>(
  schemaName: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getAppPool();
  const client = await pool.connect();
  try {
    // Şema adı güvenli kabul edilir: yalnızca slug'tan türetilir ve slug
    // [a-z0-9_]+ deseni ile sınırlıdır (provision scriptinde doğrulanır).
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Geçersiz schema adı: ${schemaName}`);
    }
    await client.query(`SET search_path TO ${schemaName}, public`);
    return await fn(client);
  } finally {
    client.release();
  }
}
