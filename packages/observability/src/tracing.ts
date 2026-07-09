/**
 * Dağıtık izleme (tracing) iskeleti.
 *
 * Faz 1'de yalnızca OpenTelemetry exporter'ları için env tabanlı yapılandırma.
 * Faz 5+ ölçeklendirmesinde tam OTel SDK kurulumu eklenecek.
 *
 * @module tracing
 */

import { z } from 'zod';

export const tracingEnvSchema = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  OTEL_SERVICE_NAME: z.string().optional(),
});

export type TracingEnv = z.infer<typeof tracingEnvSchema>;

/** Tracing'in yapılandırılıp yapılandırılmadığını söyler. */
export function isTracingEnabled(env: TracingEnv): boolean {
  return Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT);
}
