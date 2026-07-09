/**
 * Medusa — özel /ready endpoint'i (Faz 1).
 *
 * Faz 1'de passive: db bağlantısının varlığını kontrol eder;
 * Faz 2'de gerçek SELECT 1 eklenecek.
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework';

export async function GET(_req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const checks: Record<string, 'ok' | 'down' | 'skipped'> = {
    postgres: process.env['DATABASE_URL'] ? 'ok' : 'down',
    redis: process.env['REDIS_URL'] ? 'ok' : 'down',
  };
  const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'skipped');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'down',
    service: 'commerce-backend',
    version: process.env['APP_VERSION'] ?? '0.1.0',
    timestamp: new Date().toISOString(),
    checks,
  });
}
