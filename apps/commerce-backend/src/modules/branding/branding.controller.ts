/**
 * Branding Controller — Tenant white-label API.
 *
 * Endpoint'ler:
 *   GET    /branding           → Tenant branding getir
 *   PATCH  /branding           → Branding güncelle
 *   POST   /branding/logo      → Logo upload
 *   POST   /branding/favicon   → Favicon upload
 *   GET    /branding/css       → CSS variable output
 *   POST   /branding/domain/verify → Custom domain doğrulama
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiError, ErrorCode } from '@eticart/config';
import type { Response } from 'express';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { BrandingService, type TenantBranding } from './branding.service.js';

const updateBrandingSchema = z.object({
  logoUrl: z.string().url().optional(),
  logoDarkUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  brandName: z.string().min(1).max(100).optional(),
  colors: z
    .object({
      primary: z.string().regex(/^#([0-9a-fA-F]{3,8})$/).optional(),
      primaryForeground: z.string().regex(/^#([0-9a-fA-F]{3,8})$/).optional(),
      secondary: z.string().regex(/^#([0-9a-fA-F]{3,8})$/).optional(),
      accent: z.string().regex(/^#([0-9a-fA-F]{3,8})$/).optional(),
      background: z.string().regex(/^#([0-9a-fA-F]{3,8})$/).optional(),
      surface: z.string().regex(/^#([0-9a-fA-F]{3,8})$/).optional(),
      text: z.string().regex(/^#([0-9a-fA-F]{3,8})$/).optional(),
      textMuted: z.string().regex(/^#([0-9a-fA-F]{3,8})$/).optional(),
      border: z.string().regex(/^#([0-9a-fA-F]{3,8})$/).optional(),
    })
    .optional(),
  font: z
    .object({
      family: z.string().max(200).optional(),
      headingFamily: z.string().max(200).optional(),
    })
    .optional(),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl', 'full']).optional(),
  email: z
    .object({
      fromName: z.string().max(100).optional(),
      replyTo: z.string().email().optional(),
      footerText: z.string().max(500).optional(),
      logoUrl: z.string().url().optional(),
      accentColor: z.string().regex(/^#([0-9a-fA-F]{3,8})$/).optional(),
    })
    .optional(),
  social: z
    .object({
      instagram: z.string().max(200).optional(),
      twitter: z.string().max(200).optional(),
      facebook: z.string().max(200).optional(),
      youtube: z.string().max(200).optional(),
      linkedin: z.string().max(200).optional(),
      tiktok: z.string().max(200).optional(),
    })
    .optional(),
  contact: z
    .object({
      phone: z.string().max(50).optional(),
      email: z.string().email().optional(),
      address: z.string().max(500).optional(),
      whatsapp: z.string().max(50).optional(),
    })
    .optional(),
  customCss: z.string().max(10000).optional(),
});

const verifyDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
});

@ApiTags('Branding (White-Label)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mevcut tenant branding ayarları' })
  async getBranding(
    @CurrentUser() user: { tenantId: string },
  ): Promise<TenantBranding> {
    return this.branding.getBranding(user.tenantId);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Branding güncelle (partial)' })
  async updateBranding(
    @CurrentUser() user: { tenantId: string },
    @Body() body: unknown,
  ): Promise<TenantBranding> {
    const parsed = updateBrandingSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Geçersiz branding verisi.',
        { details: parsed.error.flatten() },
      );
    }
    return this.branding.updateBranding(user.tenantId, parsed.data);
  }

  @Get('css')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Branding CSS variable string (inline inject için)' })
  async getCss(
    @CurrentUser() user: { tenantId: string },
    @Res() res: Response,
  ): Promise<void> {
    const css = await this.branding.getCssVariables(user.tenantId);
    res.setHeader('Content-Type', 'text/css');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(css);
  }

  @Post('domain/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Custom domain doğrulama (CNAME + TXT)' })
  async verifyDomain(
    @CurrentUser() user: { tenantId: string },
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = verifyDomainSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Geçersiz domain formatı.',
      );
    }
    return this.branding.verifyCustomDomain(user.tenantId, parsed.data.domain);
  }

  /**
   * Logo upload — basit multipart veya base64 JSON.
   * Storage service kullanır.
   */
  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logo yükle (base64 veya URL)' })
  async uploadLogo(
    @CurrentUser() user: { tenantId: string },
    @Body() body: { dataUrl?: string; url?: string; variant?: 'light' | 'dark' },
  ): Promise<{ logoUrl: string; variant: 'light' | 'dark' }> {
    // Storage service entegrasyonu Faz 20'de
    // Şimdilik: URL veya data URL doğrudan kabul edilir
    const variant = body.variant ?? 'light';
    if (body.url) {
      await this.branding.updateBranding(
        user.tenantId,
        variant === 'light'
          ? { logoUrl: body.url }
          : { logoDarkUrl: body.url },
      );
      return { logoUrl: body.url, variant };
    }
    if (body.dataUrl) {
      // Base64 data URL'i sakla (Faz 20: storage service upload)
      await this.branding.updateBranding(
        user.tenantId,
        variant === 'light'
          ? { logoUrl: body.dataUrl }
          : { logoDarkUrl: body.dataUrl },
      );
      return { logoUrl: body.dataUrl, variant };
    }
    throw new ApiError(
      400,
      ErrorCode.BAD_REQUEST,
      'url veya dataUrl zorunlu.',
    );
  }
}
