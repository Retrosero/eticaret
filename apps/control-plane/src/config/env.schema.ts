/**
 * Control-plane ortam değişkeni şeması (Zod).
 * Üretimde zorunlu alanlar `.parse` ile fırlatır.
 */

import { z } from 'zod';
import { baseEnvSchema } from '@eticart/config';

export const envSchema = baseEnvSchema.extend({
  CONTROL_PLANE_PORT: z.coerce.number().int().positive().default(4000),
  CONTROL_PLANE_GLOBAL_PREFIX: z.string().default('api/v1'),
  CONTROL_PLANE_CORS: z.string().optional(),

  DATABASE_URL: z.string().url().refine(
    (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
    'DATABASE_URL postgres olmak zorundadır.',
  ),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.string().url().refine(
    (url) => url.startsWith('redis://'),
    'REDIS_URL redis:// olmak zorundadır.',
  ),

  RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  REQUEST_BODY_LIMIT: z.string().default('1mb'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalıdır.'),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(3600),

  API_DOCS_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  API_DOCS_PATH: z.string().default('docs'),

  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
