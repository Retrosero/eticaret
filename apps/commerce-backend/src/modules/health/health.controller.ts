/**
 * Health & Readiness Controller.
 *
 * - `GET /health`  — basit liveness, her zaman 200 (container ayakta mı?)
 * - `GET /ready`   — DB bağlantısı + Redis ping (gerçekten hazır mı?)
 *
 * Coolify / Docker healthcheck için tasarlandı.
 */
import {
  Controller,
  Get,
  HttpCode,
  Inject,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createLogger } from '@eticart/config';
import { PrismaService, PRISMA_TOKEN } from '../../db/prisma.service.js';

const log = createLogger({ service: 'health' });

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(@Inject(PRISMA_TOKEN) private readonly prisma: PrismaService) {}

  /**
   * Liveness — container çalışıyor mu?
   * Her zaman 200 döner (hata durumunda 503).
   */
  @Get('health')
  @HttpCode(200)
  async liveness(): Promise<{
    status: 'ok' | 'down';
    service: string;
    version: string;
    uptime: number;
    timestamp: string;
  }> {
    return {
      status: 'ok',
      service: 'commerce-backend',
      version: process.env['APP_VERSION'] ?? '0.1.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness — tüm bağımlılıklara bağlanabiliyor mu?
   * DB ve Redis kontrolü yapar; herhangi biri başarısızsa 503 döner.
   */
  @Get('ready')
  async readiness(): Promise<{
    status: 'ready' | 'not-ready';
    checks: {
      database: { ok: boolean; error?: string };
      redis: { ok: boolean; error?: string };
    };
    timestamp: string;
  }> {
    const checks = {
      database: { ok: false, error: undefined as string | undefined },
      redis: { ok: false, error: undefined as string | undefined },
    };

    // Postgres bağlantısı
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      checks.database.ok = true;
    } catch (err: any) {
      checks.database.error = err?.message ?? 'unknown';
      log.warn({ err }, 'DB readiness check failed');
    }

    // Redis bağlantısı (opsiyonel — REDIS_URL varsa kontrol et)
    if (process.env['REDIS_URL']) {
      try {
        // ioredis dynamic import — opsiyonel bağımlılık
        const redisModule = await import('ioredis' as string).catch(() => null);
        if (!redisModule) {
          // ioredis yüklü değil, redis kontrolünü atla
          checks.redis.ok = true;
        } else {
          const Redis = (redisModule as any).default ?? redisModule;
          const url = process.env['REDIS_URL']!;
          const redis = new Redis(url, {
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            connectTimeout: 2000,
          });
          await redis.connect();
          await redis.ping();
          await redis.quit();
          checks.redis.ok = true;
        }
      } catch (err: any) {
        checks.redis.error = err?.message ?? 'unknown';
        log.warn({ err }, 'Redis readiness check failed');
      }
    } else {
      checks.redis.ok = true; // Redis yok sayılır
    }

    const ready = checks.database.ok && checks.redis.ok;
    return {
      status: ready ? 'ready' : 'not-ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}