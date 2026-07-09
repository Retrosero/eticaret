/**
 * Zod tabanlı NestJS DTO üreticisi.
 *
 * Amaç: `@eticart/validation` paketindeki Zod şemalarını NestJS
 * `@Body()` ile kullanılabilen sınıflara dönüştürmek.
 *
 * `class-validator`/`class-transformer` yerine saf Zod kullanılır; DTO
 * sınıfı runtime'da `ZodValidationPipe` ile doğrulanır.
 *
 * @example
 * ```ts
 * export const AddToCartSchema = z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() });
 * export class AddToCartDto extends createZodDto(AddToCartSchema) {}
 * ```
 */

import type { z, ZodTypeAny } from 'zod';

/**
 * Zod şemasından NestJS-uyumlu sınıf türetir.
 *
 * Üretilen sınıf yalnızca tür düzeyinde kullanılır (instance kontrolü yok);
 * alanlar `ZodValidationPipe` tarafından runtime'da doğrulanır.
 */
export function createZodDto<T extends ZodTypeAny>(schema: T): z.infer<T> {
  // Sınıf olarak kullanılabilmesi için constructor döndürüyoruz.
  class ZodDto {
    constructor() {
      // Runtime doğrulama pipe tarafından yapılır; burada yalnızca tip taşıyıcı.
    }
  }
  // Tip bağlaması için schema referansını sınıf üzerinde tutuyoruz.
  (ZodDto as unknown as { __zodSchema: T }).__zodSchema = schema;
  return ZodDto as unknown as z.infer<T>;
}