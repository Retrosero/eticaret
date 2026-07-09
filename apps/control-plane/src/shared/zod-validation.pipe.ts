/**
 * Zod tabanlı NestJS validation pipe.
 *
 * Her controller `@Body()`, `@Query()` veya `@Param()` üzerinde
 * bir Zod şeması belirtebilir. Pipe, gelen veriyi şemaya göre
 * doğrular; başarısızsa ZodError fırlatır (GlobalExceptionFilter
 * bunu 400 VALIDATION_ERROR'a çevirir).
 *
 * Kullanım:
 *   @Body(new ZodValidationPipe(createTenantSchema))
 *   create(@Body() dto: CreateTenantInput) { ... }
 */

import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodError, ZodSchema } from 'zod';

/**
 * Generic Zod doğrulama pipe'u. Şema generic tipinde input/output
 * aynıdır; dönüşüm yoksa input tipinde kalır.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      // GlobalExceptionFilter bunu yakalar; ancak pipe seviyesinde
      // BadRequestException fırlatmak istemciler için daha açıklayıcı.
      const error = parsed.error as ZodError;
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'İstek gövdesi doğrulaması başarısız.',
        details: {
          fieldErrors: error.flatten().fieldErrors,
          formErrors: error.flatten().formErrors,
        },
      });
    }
    return parsed.data;
  }
}