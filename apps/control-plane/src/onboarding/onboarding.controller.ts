/**
 * Tenant Onboarding Controller — Self-serve signup (SaaS).
 *
 * Akış:
 *   1. POST /onboarding/signup
 *      - Yeni tenant + ilk admin user oluşturur
 *      - Trial subscription başlatır (varsayılan plan: starter, 14 gün)
 *      - Provisioning job tetikler (subdomain, SSL, storage)
 *      - Verification email gönderir
 *      - Response: { tenantId, slug, subdomain, trialDays, status }
 *
 *   2. GET /onboarding/status/:slug
 *      - Public provisioning status sorgu
 *      - Müşteri "mağazam hazır mı?" kontrolü
 *      - Response: { status, message, subdomain, readyAt }
 *
 *   3. POST /onboarding/verify-email
 *      - Email doğrulama (signup sonrası)
 *      - Verification token ile tenant_status 'trial' yapılır
 *
 * Güvenlik:
 *   - Rate limit: 5 signup/dakika (IP başına)
 *   - Captcha: hCaptcha (ileride)
 *   - Slug uniqueness: benzersiz subdomain garantisi
 *   - Email validation: DNS MX kaydı kontrolü (opsiyonel)
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LOGGER_TOKEN } from '../common/logger.js';
import { Inject } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { OnboardingService } from './onboarding.service.js';

/** Self-serve signup şeması. */
export const signupSchema = z.object({
  // Tenant bilgileri
  tenantName: z.string().min(2).max(100),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Sadece küçük harf, rakam ve tire içerebilir'),

  // İlk admin kullanıcı
  adminEmail: z.string().email().max(255),
  adminFullName: z.string().min(2).max(100),
  adminPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
      'En az 1 küçük harf, 1 büyük harf ve 1 rakam içermelidir',
    ),

  // Opsiyonel
  planCode: z.string().min(1).max(50).default('starter'),
  companyName: z.string().max(200).optional(),
  phone: z.string().regex(/^\+?[0-9\s-]{7,20}$/).optional(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Kullanım koşullarını kabul etmelisiniz.' }),
  }),
});

/** Email doğrulama şeması. */
export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(256),
});

@ApiTags('Onboarding (Public)')
@Controller('onboarding')
@UseGuards(ThrottlerGuard)
export class OnboardingController {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    private readonly onboarding: OnboardingService,
  ) {}

  /**
   * Yeni tenant kaydı (self-serve).
   *
   * Response: { tenantId, slug, subdomain, status, trialEndsAt }
   */
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Yeni tenant oluştur (self-serve SaaS signup)',
  })
  async signup(
    @Body(new ZodValidationPipe(signupSchema))
    body: z.infer<typeof signupSchema>,
  ): Promise<unknown> {
    try {
      return await this.onboarding.signup(body);
    } catch (err: any) {
      // ZodError dönüşümü
      if (err?.name === 'ZodError') {
        throw new ApiError(
          422,
          ErrorCode.VALIDATION_ERROR,
          'Girdi doğrulaması başarısız.',
          { details: err.flatten?.() },
        );
      }
      throw err;
    }
  }

  /**
   * Provisioning durumunu sorgula (public).
   */
  @Get('status/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tenant kurulum durumunu sorgula',
  })
  async status(@Param('slug') slug: string): Promise<unknown> {
    const validated = z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-z0-9-]+$/)
      .safeParse(slug);
    if (!validated.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz slug.');
    }
    return this.onboarding.getStatus(validated.data);
  }

  /**
   * Real-time provisioning status (Server-Sent Events).
   * GET /onboarding/stream/:slug
   *
   * Müşteri bu endpoint'i subscribe ederek mağaza kurulum
   * ilerlemesini canlı izler.
   */
  @Get('stream/:slug')
  @ApiOperation({
    summary: 'Provisioning durumunu SSE ile canlı izle',
  })
  async stream(
    @Param('slug') slug: string,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const send = (data: unknown) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // İlk durumu hemen gönder
      const status = await this.onboarding.getStatus(slug);
      send({ event: 'status', ...status });

      // 60 saniye boyunca her 2 saniyede status gönder
      let count = 0;
      const maxIterations = 30;
      const interval = setInterval(async () => {
        try {
          const s = await this.onboarding.getStatus(slug);
          send({ event: 'status', ...s });

          if (
            s.status === 'trial' ||
            s.status === 'active' ||
            s.status === 'provisioning_failed' ||
            count >= maxIterations
          ) {
            send({ event: 'complete', status: s.status });
            clearInterval(interval);
            res.end();
          }
          count++;
        } catch (err) {
          send({ event: 'error', message: (err as Error).message });
          clearInterval(interval);
          res.end();
        }
      }, 2000);

      // Client bağlantıyı kopardı
      res.on('close', () => {
        clearInterval(interval);
      });
    } catch (err) {
      send({ event: 'error', message: (err as Error).message });
      res.end();
    }
  }

  /**
   * Email doğrulama (signup sonrası).
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email doğrulama tokeni ile tenant aktifleştir',
  })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema))
    body: z.infer<typeof verifyEmailSchema>,
  ): Promise<unknown> {
    return this.onboarding.verifyEmail(body.token);
  }
}