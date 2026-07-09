/**
 * Tüm uygulamalar için ortak ortam değişkeni şeması.
 *
 * Her uygulama bu şemayı `extend` eder; böylece ortak alanlar
 * (NODE_ENV, LOG_LEVEL, vb.) her yerde tutarlıdır.
 *
 * @module env/base-schema
 */

import { z } from 'zod';

export const baseEnvSchema = z.object({
  // ----- Çalışma ortamı -----
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  APP_VERSION: z.string().default('0.1.0'),

  // ----- Servis kimliği -----
  SERVICE_NAME: z.string().min(1).default('app'),
  SERVICE_PORT: z.coerce.number().int().positive().default(3000),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
