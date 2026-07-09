/**
 * Sağlık ve hazırlık kontrolleri.
 *
 *  GET /health  — liveness (süreç çalışıyor mu?)
 *  GET /ready   — readiness (veritabanı + redis bağlantıları canlı mı?)
 */

import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
} from '@nestjs/swagger';
import {
  ok,
  type HealthCheckResponse,
  type ReadinessResponse,
} from '@eticart/shared-types';
import type { Logger } from '@eticart/config';
import { LOGGER_TOKEN } from '../common/logger.js';
import { DbHealthService } from './db-health.service.js';

interface TimeSource {
  now(): Date;
  uptimeSeconds(): number;
}

const defaultTime: TimeSource = {
  now: () => new Date(),
  uptimeSeconds: () => Math.floor(process.uptime()),
};

@ApiTags('Sistem')
@Controller()
export class HealthController {
  private readonly startedAt = new Date();

  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    private readonly dbHealth: DbHealthService,
  ) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness kontrolü' })
  @ApiOkResponse({ description: 'Süreç sağlıklı çalışıyor.' })
  health(): HealthCheckResponse {
    this.logger.info('Liveness kontrolü başarılı');
    return {
      status: 'ok',
      service: 'control-plane',
      version: process.env['APP_VERSION'] ?? '0.1.0',
      timestamp: defaultTime.now().toISOString(),
      uptimeSeconds: defaultTime.uptimeSeconds(),
    };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness kontrolü (DB + Redis)' })
  @ApiOkResponse({ description: 'Tüm bağımlılıklar hazır.' })
  async ready(): Promise<ReadinessResponse> {
    const checks = await this.dbHealth.runChecks();
    const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'skipped');

    return {
      status: allOk ? 'ok' : 'down',
      service: 'control-plane',
      version: process.env['APP_VERSION'] ?? '0.1.0',
      timestamp: defaultTime.now().toISOString(),
      uptimeSeconds: Math.floor((defaultTime.now().getTime() - this.startedAt.getTime()) / 1000),
      checks,
    };
  }
}

// Re-export the wrapper for tests
export { ok };
