/**
 * DB + Redis bağlantı canlılık kontrolleri.
 *
 * Faz 2'de gerçek bağlantılar kullanılır. `pg.Pool` üzerinden
 * `SELECT 1` çalıştırılır; Redis tarafı Faz 6'da eklenecek
 * (kuyruk + cache).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';

import { PG_POOL_TOKEN, pingDatabase } from '../database/database.module.js';

export type CheckResult = 'ok' | 'down' | 'skipped';

@Injectable()
export class DbHealthService {
  constructor(@Inject(PG_POOL_TOKEN) private readonly pool: Pool) {}

  async runChecks(): Promise<Record<string, CheckResult>> {
    let pg: CheckResult = 'ok';
    try {
      const alive = await pingDatabase(this.pool);
      pg = alive ? 'ok' : 'down';
    } catch {
      pg = 'down';
    }

    return {
      postgres: pg,
      redis: 'skipped',
    };
  }
}