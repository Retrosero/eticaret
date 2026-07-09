/**
 * Ortam değişkeni doğrulama yardımcısı.
 *
 * Her uygulama kendi şemasını tanımlar ve bu fonksiyonu çağırır.
 * Production'da zorunlu alan eksikse uygulama başlamaz.
 *
 * @module env
 */

import { z } from 'zod';

/** Zod ile türetilmiş şema. */
export type EnvSchema<T extends z.ZodTypeAny> = T;

/**
 * Ortam değişkenlerini verilen Zod şemasına göre doğrular.
 *
 * Üretimde (`process.env.NODE_ENV === 'production'`) herhangi bir
 * doğrulama hatasında, hata detaylarıyla birlikte fırlatır.
 * Geliştirmede ayrıntılı log basar ama çalışmaya devam eder.
 */
export function loadEnv<T extends z.ZodTypeAny>(
  schema: T,
  options?: { env?: Record<string, string | undefined>; serviceName?: string },
): z.infer<T> {
  const serviceName = options?.serviceName ?? 'app';
  const source = options?.env ?? process.env;
  const isProduction = source['NODE_ENV'] === 'production';

  const parsed = schema.safeParse(source);

  if (parsed.success) {
    return parsed.data;
  }

  const flat = parsed.error.flatten().fieldErrors;
  const summary = Object.entries(flat)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join('; ');

  const message = `[${serviceName}] Ortam değişkeni doğrulaması başarısız: ${summary}`;

  if (isProduction) {
    throw new Error(message);
  }

  console.error(message);
  // Geliştirmede son çare olarak yine de parsed.data dönmek mantıklı değil;
  // çünkü o zaman zorunlu alanlar undefined döner ve daha geç patlar.
  throw new Error(message);
}
