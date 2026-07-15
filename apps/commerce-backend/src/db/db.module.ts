/**
 * DB modülü — Prisma sağlayıcısı dışa aktarımı.
 */

import { Module, Global } from '@nestjs/common';
import { Pool } from 'pg';

import { ControlPrismaService, PrismaService, PRISMA_TOKEN, CONTROL_PRISMA_TOKEN } from './prisma.service.js';

export const PG_POOL_TOKEN = 'PG_POOL_TOKEN';

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_TOKEN,
      useFactory: (): PrismaService => new PrismaService(),
    },
    PrismaService,
    {
      provide: PG_POOL_TOKEN,
      useFactory: (): Pool => {
        const pool = new Pool({
          connectionString: process.env['DATABASE_URL'],
          max: Number(process.env['DATABASE_POOL_MAX'] ?? 10),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        });
        pool.on('error', () => undefined);
        return pool;
      },
    },
    {
      provide: CONTROL_PRISMA_TOKEN,
      useClass: ControlPrismaService,
    },
  ],
  exports: [PRISMA_TOKEN, PrismaService, CONTROL_PRISMA_TOKEN, PG_POOL_TOKEN],
})
export class DbModule {}
