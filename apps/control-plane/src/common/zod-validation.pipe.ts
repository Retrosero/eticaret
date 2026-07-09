/**
 * ZodValidationPipe — Zod şeması ile request body doğrulama pipe'ı.
 *
 * Kullanım:
 *   @Body(new ZodValidationPipe(signupSchema)) body: SignupInput
 *
 * Hata durumunda 422 + ValidationError fırlatır.
 */
import {
  ArgumentMetadata,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Girdi doğrulaması başarısız.',
        { details: result.error.flatten() as Record<string, unknown> },
      );
    }
    return result.data;
  }
}