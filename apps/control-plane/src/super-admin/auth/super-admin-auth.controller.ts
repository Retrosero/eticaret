/**
 * Super admin auth controller.
 *
 * Tüm endpoint'ler public (auth gerekmez). Login sonrası alınan
 * token, korumalı uçlarda (`/api/v1/super-admin/*`) kullanılır.
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiError, ErrorCode } from '@eticart/config';
import { z } from 'zod';

import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../auth/decorators/auth-user.decorator.js';
import { Public } from '../../auth/decorators/public.decorator.js';
import type { AuthPrincipal } from '../../auth/types/auth-principal.js';
import {
  SuperAdminAuthService,
  type AuthTokensResponse,
} from './services/super-admin-auth.service.js';
import {
  superAdminLoginSchema,
  superAdminRefreshSchema,
  superAdminForgotPasswordSchema,
  superAdminResetPasswordSchema,
  superAdminTwoFactorVerifySchema,
  type SuperAdminLoginInput,
  type SuperAdminRefreshInput,
  type SuperAdminForgotPasswordInput,
  type SuperAdminResetPasswordInput,
  type SuperAdminTwoFactorVerifyInput,
} from './dto/super-admin-auth.dto.js';

@ApiTags('Süper Admin — Kimlik Doğrulama')
@Controller('super-admin/auth')
@Public()
export class SuperAdminAuthController {
  constructor(
    private readonly auth: SuperAdminAuthService,
    @Inject('PG_POOL_TOKEN') private readonly pool: import('pg').Pool,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Süper admin girişi (email + şifre, gerekirse 2FA)' })
  @ApiOkResponse({ description: 'JWT token çifti ve kullanıcı bilgisi.' })
  async login(
    @Body(new ZodValidationPipe(superAdminLoginSchema)) body: SuperAdminLoginInput,
    @Req() req: Request,
  ): Promise<AuthTokensResponse> {
    const ctx = {
      email: body.email,
      password: body.password,
      twoFactorCode: body.twoFactorCode,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      deviceName: extractDeviceName(req),
    };
    return this.auth.login(ctx);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yenileme belirteci ile yeni access+refresh çifti al' })
  async refresh(
    @Body(new ZodValidationPipe(superAdminRefreshSchema)) body: SuperAdminRefreshInput,
  ): Promise<AuthTokensResponse> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mevcut oturumu kapat' })
  async logout(@CurrentUser() user: AuthPrincipal): Promise<{ ok: true }> {
    return this.auth.logout(user.sessionId);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tüm cihazlardan çıkış' })
  async logoutAll(@CurrentUser() user: AuthPrincipal): Promise<{ revokedSessions: number }> {
    return this.auth.logoutAll(user.userId);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Şifre sıfırlama e-postası gönder' })
  async forgotPassword(
    @Body(new ZodValidationPipe(superAdminForgotPasswordSchema)) body: SuperAdminForgotPasswordInput,
  ): Promise<{ ok: true }> {
    return this.auth.requestPasswordReset(body.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sıfırlama belirteci ile yeni şifre belirle' })
  async resetPassword(
    @Body(new ZodValidationPipe(superAdminResetPasswordSchema)) body: SuperAdminResetPasswordInput,
  ): Promise<{ ok: true }> {
    return this.auth.resetPassword(body.token, body.newPassword);
  }

  // ----- 2FA -----

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '2FA kurulumu başlat (TOTP secret + QR kod)' })
  async twoFactorSetup(@CurrentUser() user: AuthPrincipal): Promise<{
    secret: string;
    qrCodeDataUrl: string;
    manualEntryKey: string;
  }> {
    const r = await this.pool.query<{ email: string }>(
      `SELECT email FROM public.super_admin_users WHERE id = $1`,
      [user.userId],
    );
    const row = r.rows[0];
    if (!row) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Kullanıcı bulunamadı.');
    }
    return this.auth.startTwoFactorSetup(user.userId, row.email);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '2FA doğrula ve aktif et; backup kodları döner' })
  async twoFactorEnable(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(superAdminTwoFactorVerifySchema)) body: SuperAdminTwoFactorVerifyInput,
  ): Promise<{ backupCodes: ReadonlyArray<string> }> {
    return this.auth.enableTwoFactor(user.userId, body.code);
  }
}

// HTTP isteğinden client bilgisi çıkaran yardımcılar

function getClientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0]?.trim() ?? null;
  return req.socket?.remoteAddress ?? null;
}

function getUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : null;
}

function extractDeviceName(req: Request): string | null {
  // Basit heuristic: UA'dan tarayıcı + OS çıkar.
  const ua = getUserAgent(req);
  if (!ua) return null;
  const browserMatch = /(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/.exec(ua);
  const osMatch = /(Windows|Macintosh|Linux|Android|iOS)/.exec(ua);
  const browser = browserMatch ? browserMatch[1] : 'Bilinmeyen';
  const os = osMatch ? osMatch[1] : 'Bilinmeyen';
  return `${browser} / ${os}`;
}

// z import referansı (kullanım dışı; tip çıkarımı için)
void z;