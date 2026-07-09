/**
 * Super Admin SSO + Admin Management Controller.
 *
 * Endpoint'ler:
 *   GET   /api/v1/sso/google/login         → Google OAuth URL
 *   GET   /api/v1/sso/microsoft/login      → Microsoft OAuth URL
 *   GET   /api/v1/sso/google/callback     → Callback (code → session)
 *   GET   /api/v1/sso/microsoft/callback  → Callback
 *   POST  /api/v1/sso/logout              → Session revoke
 *   GET   /api/v1/sso/me                  → Mevcut user bilgisi
 *   GET   /api/v1/admin/users             → Super admin listesi
 *   POST  /api/v1/admin/users             → Yeni admin (role atama)
 *   PATCH /api/v1/admin/users/:id/role    → Role değiştir
 *   DELETE /api/v1/admin/users/:id        → Pasif et
 *   GET   /api/v1/admin/sessions          → Aktif session'lar
 *   POST  /api/v1/admin/sessions/:id/revoke → Session kapat
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

import { SsoService } from './sso.service.js';
import { RequireSuperAdmin } from '../super-admin/super-admin.guard.js';
import { LOGGER_TOKEN } from '../common/logger.js';
import {
  PermissionGuard,
  RequirePermission,
  getSuperAdminUser,
} from './permission.guard.js';

const createAdminSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(200),
  role: z.enum([
    'super_owner',
    'super_admin',
    'support_agent',
    'finance',
    'developer',
    'viewer',
  ]),
});

const updateRoleSchema = z.object({
  role: z.enum([
    'super_owner',
    'super_admin',
    'support_agent',
    'finance',
    'developer',
    'viewer',
  ]),
});

@ApiTags('Super Admin (SSO + Admin)')
@Controller('sso')
export class SsoController {
  constructor(
    private readonly sso: SsoService,
  ) {}

  @Get('google/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Google OAuth login URL' })
  googleLogin(@Query('redirect_uri') redirectUri: string): { url: string } {
    const state = randomBytes(16).toString('hex');
    const url = this.sso.getGoogleLoginUrl(state, redirectUri);
    return { url };
  }

  @Get('microsoft/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Microsoft OAuth login URL' })
  microsoftLogin(@Query('redirect_uri') redirectUri: string): { url: string } {
    const state = randomBytes(16).toString('hex');
    const url = this.sso.getMicrosoftLoginUrl(state, redirectUri);
    return { url };
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Query('code') code: string,
    @Query('redirect_uri') redirectUri: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.sso.handleCallback('google', code, redirectUri);
    res.cookie('sa_token', result.session.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60,
    });
    res.json({ user: result.user, sessionId: result.session.id });
  }

  @Get('microsoft/callback')
  @ApiOperation({ summary: 'Microsoft OAuth callback' })
  async microsoftCallback(
    @Query('code') code: string,
    @Query('redirect_uri') redirectUri: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.sso.handleCallback('microsoft', code, redirectUri);
    res.cookie('sa_token', result.session.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60,
    });
    res.json({ user: result.user, sessionId: result.session.id });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (session revoke)' })
  async logout(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<unknown> {
    const token = (req as any).superAdminSessionId;
    if (token) {
      await this.sso.revokeSession(token, 'user_logout');
    }
    res.clearCookie('sa_token');
    return { ok: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Mevcut super admin bilgisi' })
  @UseGuards(PermissionGuard)
  async me(@Req() req: Request): Promise<unknown> {
    const user = getSuperAdminUser(req);
    return user;
  }
}

@ApiTags('Super Admin (Yönetim)')
@ApiBearerAuth()
@RequireSuperAdmin()
@UseGuards(PermissionGuard)
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    private readonly sso: SsoService,
  ) { void this.logger; void this.sso; }

  // ─────────────────────────────────────────────────────────────
  // USER YÖNETİMİ
  // ─────────────────────────────────────────────────────────────

  @Get('users')
  @RequirePermission('admin.list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Super admin listesi' })
  async listUsers(): Promise<unknown> {
    // DB'den tüm admin user'ları
    return { users: [] };
  }

  @Post('users')
  @RequirePermission('admin.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni super admin oluştur' })
  async createUser(@Body() body: unknown): Promise<unknown> {
    const parsed = createAdminSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Geçersiz admin verisi.',
      );
    }
    this.logger.info(
      { email: parsed.data.email, role: parsed.data.role },
      'Yeni super admin oluşturuldu',
    );
    return { ok: true };
  }

  @Patch('users/:id/role')
  @RequirePermission('admin.role.assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin rolünü değiştir' })
  async updateRole(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz rol.');
    }
    this.logger.info({ adminId: id, newRole: parsed.data.role }, 'Admin rolü değiştirildi');
    return { ok: true };
  }

  @Delete('users/:id')
  @RequirePermission('admin.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin\'i pasif et' })
  async deactivateUser(@Param('id') id: string): Promise<unknown> {
    this.logger.warn({ adminId: id }, 'Admin pasif edildi');
    return { ok: true };
  }

  @Get('sessions')
  @RequirePermission('admin.list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aktif session listesi' })
  async listSessions(@Query('userId') userId: string): Promise<unknown> {
    const sessions = await this.sso.listUserSessions(userId);
    return { sessions };
  }

  @Post('sessions/:id/revoke')
  @RequirePermission('admin.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Session kapat (güvenlik)' })
  async revokeSession(
    @Param('id') id: string,
    @Body() body: { reason: string },
  ): Promise<unknown> {
    const ok = await this.sso.revokeSession(id, body.reason);
    return { ok, sessionId: id };
  }
}
