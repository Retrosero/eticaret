/**
 * Zod doğrulama pipe'i — `class-validator` yerine Zod şemaları kullanır.
 *
 * Kullanım:
 *   @Body(new ZodValidationPipe(AddToCartSchema)) body: AddToCartInput
 *
 * Hata durumunda `global-exception.filter` ile uyumlu ApiError fırlatır.
 */

import {
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';

@Injectable()
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'İstek gövdesi doğrulama hatası.',
        { details: this.formatZodError(result.error) },
      );
    }
    return result.data as z.infer<T>;
  }

  /** Zod hata ağacını istemci dostu formata çevirir. */
  private formatZodError(err: ZodError): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.') || '_root';
      if (!out[path]) out[path] = [];
      out[path].push(issue.message);
    }
    return out;
  }
}