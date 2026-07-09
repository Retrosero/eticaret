/**
 * Medusa — özel /health endpoint'i (Faz 1).
 *
 * Medusa v2'de özel REST endpoint'ler `src/api/...` altında tanımlanır.
 * Bu dosya uygulamanın liveness kontrolünü sağlar.
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework';

export async function GET(_req: MedusaRequest, res: MedusaResponse): Promise<void> {
  res.status(200).json({
    status: 'ok',
    service: 'commerce-backend',
    version: process.env['APP_VERSION'] ?? '0.1.0',
    timestamp: new Date().toISOString(),
  });
}
