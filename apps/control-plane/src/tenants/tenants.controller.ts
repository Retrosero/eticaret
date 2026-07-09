/**
 * Tenants — Faz 2'de genişletilecek placeholder.
 *
 * Faz 1'de yalnızca uçtan uca "endpoint var mı?" kontrolü için
 * /tenants üzerinden basit bir ping yanıtı verir.
 */

import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { ok, ApiError, ErrorCode, type Logger } from '@eticart/config';
import { createTenantSchema } from '@eticart/validation';
import { LOGGER_TOKEN } from '../common/logger.js';

@ApiTags('Kiracılar')
@Controller('tenants')
export class TenantsController {
  constructor(@Inject(LOGGER_TOKEN) private readonly logger: Logger) {}

  @Get('ping')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modülün canlı olduğunu doğrular (Faz 1 placeholder)' })
  @ApiOkResponse({ description: 'Modül hazır.' })
  ping(): { ok: true; module: string } {
    this.logger.debug('TenantsModule ping');
    return { ok: true, module: 'tenants' };
  }

  /**
   * Faz 2'de gerçek provision implementasyonu eklenecek. Şimdilik
   * yalnızca girdi doğrulaması + 501 yanıtı veriyoruz.
   */
  @Get('provision')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @ApiOperation({ summary: "Yeni tenant oluştur (Faz 2'de aktif olacak)" })
  provision(): { ok: true } {
    // Şema doğrulama (kullanım örneği):
    const sample = createTenantSchema.safeParse({
      slug: 'placeholder',
      name: 'Yer tutucu',
    });
    if (!sample.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Girdi doğrulaması başarısız.',
        { details: sample.error.flatten() },
      );
    }
    return { ok: true };
  }
}

// İmzasız şemaya referans (kullanılmıyor; anlamı kalmadı)
const _unused: z.ZodType<unknown> = z.unknown();
void _unused;
