/**
 * 2FA (TOTP) controller — admin kullanıcılar için.
 *
 * Endpoint'ler:
 *  - POST /api/auth/2fa/setup    → secret + QR URL
 *  - POST /api/auth/2fa/verify   → 6 haneli kodu doğrula ve aktifleştir
 *  - POST /api/auth/2fa/disable  → 2FA'yı kapat (mevcut kod gerekir)
 *  - GET  /api/auth/2fa/status   → aktif mi?
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../../common/roles.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PrismaService, PRISMA_TOKEN } from '../../db/prisma.service.js';
import {
  generateSecret,
  generateOtpAuthUrl,
  verifyTotp,
} from '../../common/totp.js';

const VerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const DisableSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

/** Yedek kod üret (8 adet, tek kullanımlık). */
function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(4).toString('hex').toUpperCase(),
  );
}

@Controller('api/auth/2fa')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tenant_admin')
export class Auth2FAController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /**
   * 2FA setup — yeni secret üret, QR URL döner.
   */
  @Post('setup')
  @HttpCode(200)
  async setup(@Req() req: AuthenticatedRequest): Promise<unknown> {
    const userId = req.user?.sub;
    if (!userId) throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Kullanıcı kimliği yok.');

    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new ApiError(400, ErrorCode.TENANT_NOT_FOUND, 'Tenant kimliği yok.');

    const email: string = (req.user?.email as string) ?? `${userId}@eticart.local`;
    const secret = generateSecret();
    const otpAuthUrl = generateOtpAuthUrl({
      secret,
      accountName: email,
      issuer: 'eticart',
    });

    // Pending secret sakla
    await this.prisma.client.userTwoFactor.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: {
        tenantId,
        userId,
        enabled: false,
        secret, // henüz doğrulanmadı
      },
      update: {
        enabled: false,
        secret, // yeni secret üretildi
      },
    });

    return {
      secret,
      otpAuthUrl,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(otpAuthUrl)}&size=300x300`,
      manual: 'Google Authenticator uygulamasında QR kodu tarayın veya secret\'i manuel girin.',
    };
  }

  /**
   * 2FA verify — 6 haneli kodu doğrula ve aktifleştir.
   */
  @Post('verify')
  @HttpCode(200)
  async verify(
    @Body(new ZodValidationPipe(VerifySchema)) body: z.infer<typeof VerifySchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const userId = req.user?.sub;
    if (!userId) throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Kullanıcı kimliği yok.');

    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new ApiError(400, ErrorCode.TENANT_NOT_FOUND, 'Tenant kimliği yok.');

    const record = await this.prisma.client.userTwoFactor.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!record || !record.secret) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        '2FA setup başlatılmamış. Önce /setup çağrısı yapın.',
      );
    }

    if (record.enabled) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        '2FA zaten aktif. Tekrar aktifleştirmek için önce /disable yapın.',
      );
    }

    if (!verifyTotp(record.secret, body.code)) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'Doğrulama kodu geçersiz veya süresi dolmuş.',
      );
    }

    const backupCodes = generateBackupCodes();
    await this.prisma.client.userTwoFactor.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: {
        enabled: true,
        enabledAt: new Date(),
        backupCodes,
      },
    });

    return {
      ok: true,
      twoFactorEnabled: true,
      backupCodes, // bir kerede gösterilir, sonra saklanmaz
      message: '2FA aktifleştirildi. Yedek kodları güvenli bir yere kaydedin.',
    };
  }

  /**
   * 2FA durum kontrolü.
   */
  @Get('status')
  async status(@Req() req: AuthenticatedRequest): Promise<unknown> {
    const userId = req.user?.sub;
    if (!userId) throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Kullanıcı kimliği yok.');

    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new ApiError(400, ErrorCode.TENANT_NOT_FOUND, 'Tenant kimliği yok.');

    const record = await this.prisma.client.userTwoFactor.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { enabled: true, enabledAt: true, lastUsedAt: true },
    });

    return {
      enabled: !!record?.enabled,
      enabledAt: record?.enabledAt ?? null,
      lastUsedAt: record?.lastUsedAt ?? null,
    };
  }

  /**
   * 2FA kapat.
   */
  @Post('disable')
  @HttpCode(200)
  async disable(
    @Body(new ZodValidationPipe(DisableSchema)) body: z.infer<typeof DisableSchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const userId = req.user?.sub;
    if (!userId) throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Kullanıcı kimliği yok.');

    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new ApiError(400, ErrorCode.TENANT_NOT_FOUND, 'Tenant kimliği yok.');

    const record = await this.prisma.client.userTwoFactor.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!record || !record.enabled || !record.secret) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, '2FA zaten aktif değil.');
    }

    if (!verifyTotp(record.secret, body.code)) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'Doğrulama kodu geçersiz veya süresi dolmuş.',
      );
    }

    await this.prisma.client.userTwoFactor.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: {
        enabled: false,
        enabledAt: null,
        secret: null,
        lastUsedCode: null,
        lastUsedAt: null,
        backupCodes: [],
      },
    });

    return { ok: true, twoFactorEnabled: false };
  }
}