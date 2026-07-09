/**
 * Control-plane veritabanı modülü.
 *
 * Bu modül, NestJS tarafından sağlanan `pg.Pool` örneğini uygulama
 * genelinde paylaşır. Service katmanı doğrudan bu pool üzerinden
 * sorgu atmaz; bunun yerine her modülün kendi repository'si vardır
 * ve repository'ler `TxRunner` ile transaction yönetir.
 *
 * Neden `pg.Pool`? Çünkü Faz 1'de zaten `pg` bağımlılığı kurulu;
 * ek bir ORM (Prisma, Drizzle, vb.) eklemek yerine ham SQL ile
 * hem okunabilirlik hem migration güvenliği sağlanır. Tüm SQL
 * ifadeleri `infra/migrations/` altında versiyonlanmış dosyalardadır.
 */

import {
  Global,
  Module,
  type OnApplicationShutdown,
  Inject,
  Injectable,
  type Provider,
} from '@nestjs/common';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

import { LOGGER_TOKEN } from '../common/logger.js';
import type { Logger } from '@eticart/config';

export const PG_POOL_TOKEN = Symbol.for('@eticart/control-plane/PG_POOL');
export const TX_RUNNER_TOKEN = Symbol.for('@eticart/control-plane/TX_RUNNER');

/**
 * `TxRunner` — tek bir transaction içinde birden çok sorgu çalıştırır.
 * Verilen callback hata fırlatırsa transaction `ROLLBACK`, aksi
 * durumda `COMMIT` edilir. Bağlantı callback sonuna kadar tutulur.
 */
@Injectable()
export class TxRunner {
  constructor(@Inject(PG_POOL_TOKEN) private readonly pool: Pool) {}

  /**
   * Transaction içinde çalıştır.
   * @throws Hata fırlatılırsa rollback yapılır.
   */
  async run<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // rollback hatası yutulur; asıl hata yukarı fırlatılacak.
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * Uygulama kapanırken pool'u temizler. DI üzerinden pool alır.
 */
@Injectable()
export class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL_TOKEN) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

const pgPoolProvider: Provider = {
  provide: PG_POOL_TOKEN,
  useFactory: (logger: Logger): Pool => {
    const url = process.env['DATABASE_URL'];
    if (!url) {
      throw new Error('DATABASE_URL tanımsız; control-plane başlatılamaz.');
    }
    const min = Number(process.env['DATABASE_POOL_MIN'] ?? 2);
    const max = Number(process.env['DATABASE_POOL_MAX'] ?? 10);
    const pool = new Pool({
      connectionString: url,
      min,
      max,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err: Error) => {
      logger.error({ err }, 'Beklenmeyen pg.Pool hatası');
    });
    return pool;
  },
  inject: [LOGGER_TOKEN],
};

const txRunnerProvider: Provider = {
  provide: TX_RUNNER_TOKEN,
  useFactory: (pool: Pool): TxRunner => new TxRunner(pool),
  inject: [PG_POOL_TOKEN],
};

/**
 * Kök veritabanı modülü. Uygulama modülüne `imports` edilir.
 */
@Global()
@Module({
  providers: [pgPoolProvider, txRunnerProvider, DatabaseShutdown],
  exports: [PG_POOL_TOKEN, TX_RUNNER_TOKEN],
})
export class DatabaseModule {}

/**
 * Yardımcı: pg.Pool'dan veya bir PoolClient'tan sorgu çalıştırır.
 * Repository'ler bu fonksiyonu kullanır; transaction içinde client
 * geçildiğinde sorgular o client üzerinden gider.
 */
export async function execQuery<R extends QueryResultRow = QueryResultRow>(
  runner: Pool | PoolClient,
  text: string,
  values?: ReadonlyArray<unknown>,
): Promise<QueryResult<R>> {
  return runner.query<R>(text, values as unknown[]);
}

/**
 * Yalnızca test amaçlı: Havuzun bağlı olup olmadığını kontrol eder.
 * Health check modülünde de kullanılır.
 */
export async function pingDatabase(pool: Pool): Promise<boolean> {
  const res = await pool.query<{ ok: number }>('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}