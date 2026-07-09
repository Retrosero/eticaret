/**
 * Super Admin REST Controller — platform yönetim API'leri.
 *
 * Tüm endpoint'ler `super_admin` rolü gerektirir.
 * Frontend: apps/super-admin (Next.js 15).
 *
 * Endpoint'ler:
 *   GET  /api/v1/super-admin/dashboard
 *     → Genel istatistikler (MRR, ARR, aktif tenant, depolama, vb.)
 *   GET  /api/v1/super-admin/metrics
 *     → Detaylı metrikler (zaman serisi, churn, growth)
 *   GET  /api/v1/super-admin/tenants
 *     → Tüm tenant'lar (filtre, sayfalama)
 *   GET  /api/v1/super-admin/tenants/:id
 *     → Tenant detayı (kullanıcılar, subscription, audit)
 *   POST /api/v1/super-admin/tenants/:id/suspend
 *     → Tenant'ı askıya al
 *   POST /api/v1/super-admin/tenants/:id/reactivate
 *     → Askıdaki tenant'ı yeniden aktif et
 *   DELETE /api/v1/super-admin/tenants/:id
 *     → Soft delete (archive)
 *   GET  /api/v1/super-admin/plans
 *     → Tüm planlar
 *   POST /api/v1/super-admin/plans
 *     → Yeni plan oluştur
 *   PATCH /api/v1/super-admin/plans/:id
 *     → Plan güncelle
 *   DELETE /api/v1/super-admin/plans/:id
 *     → Plan deaktif et (soft)
 *   GET  /api/v1/super-admin/subscriptions
 *     → Tüm subscription'lar
 *   POST /api/v1/super-admin/subscriptions/:id/cancel
 *     → İptal et
 *   POST /api/v1/super-admin/subscriptions/:id/refund
 *     → İade işlemi
 *   GET  /api/v1/super-admin/audit
 *     → Audit log sorgu (filtreli)
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
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiError, ErrorCode, type Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';

import { RequireSuperAdmin } from './super-admin.guard.js';
import { SuperAdminService } from './super-admin.service.js';
import { LOGGER_TOKEN } from '../common/logger.js';

const listTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      'draft',
      'provisioning',
      'trial',
      'active',
      'overdue',
      'suspended',
      'cancelled',
      'archived',
    ])
    .optional(),
  plan: z.string().optional(),
  search: z.string().max(100).optional(),
});

const suspendSchema = z.object({
  reason: z.string().min(1).max(500),
});

const createPlanSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  monthlyPriceKurus: z.coerce.number().int().nonnegative(),
  yearlyPriceKurus: z.coerce.number().int().nonnegative(),
  currency: z.string().length(3).default('TRY'),
  trialDays: z.coerce.number().int().min(0).max(90).default(14),
  maxUsers: z.coerce.number().int().positive(),
  maxProducts: z.coerce.number().int().positive(),
  maxOrdersPerMonth: z.coerce.number().int().positive(),
  maxStorageBytes: z.coerce.number().int().nonnegative(),
  sortOrder: z.coerce.number().int().default(100),
  isActive: z.coerce.boolean().default(true),
  features: z
    .array(
      z.object({
        featureKey: z.string().min(1).max(100),
        enabled: z.coerce.boolean().default(true),
        limitValue: z.coerce.number().int().nullable().default(null),
      }),
    )
    .default([]),
});

const updatePlanSchema = createPlanSchema.partial().omit({ code: true });

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  tenantId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

@ApiTags('Süper Admin (Platform Yönetimi)')
@ApiBearerAuth()
@RequireSuperAdmin()
@UseGuards(/* SuperAdminGuard */)
@Controller('super-admin')
export class SuperAdminController {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    private readonly admin: SuperAdminService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Süper admin dashboard özeti' })
  async dashboard(): Promise<unknown> {
    return this.admin.getDashboard();
  }

  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detaylı platform metrikleri' })
  async metrics(@Query('range') range?: string): Promise<unknown> {
    return this.admin.getMetrics(range ?? '30d');
  }

  // ─────────────────────────────────────────────────────────────
  // TENANT YÖNETİMİ
  // ─────────────────────────────────────────────────────────────

  @Get('tenants')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tüm tenant\'ları listele' })
  async listTenants(
    @Query() raw: Record<string, string | undefined>,
  ): Promise<unknown> {
    const parsed = listTenantsQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Geçersiz sorgu parametreleri.',
        { details: parsed.error.flatten() },
      );
    }
    return this.admin.listTenants(parsed.data);
  }

  @Get('tenants/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tenant detayı' })
  async getTenant(@Param('id') id: string): Promise<unknown> {
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz tenant ID.');
    }
    return this.admin.getTenantDetail(parsed.data);
  }

  @Post('tenants/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tenant\'ı askıya al' })
  async suspendTenant(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz tenant ID.');
    }
    const bodyParsed = suspendSchema.safeParse(body);
    if (!bodyParsed.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Geçersiz istek gövdesi.',
        { details: bodyParsed.error.flatten() },
      );
    }
    return this.admin.suspendTenant(idParsed.data, bodyParsed.data.reason);
  }

  @Post('tenants/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tenant\'ı yeniden aktifleştir' })
  async reactivateTenant(@Param('id') id: string): Promise<unknown> {
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz tenant ID.');
    }
    return this.admin.reactivateTenant(idParsed.data);
  }

  @Delete('tenants/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tenant\'ı arşivle (soft delete)' })
  async archiveTenant(
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ): Promise<unknown> {
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz tenant ID.');
    }
    return this.admin.archiveTenant(idParsed.data, body?.reason);
  }

  // ─────────────────────────────────────────────────────────────
  // PLAN YÖNETİMİ
  // ─────────────────────────────────────────────────────────────

  @Get('plans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tüm planları listele (süper admin)' })
  async listPlans(): Promise<unknown> {
    return this.admin.listAllPlans();
  }

  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni plan oluştur' })
  async createPlan(@Body() body: unknown): Promise<unknown> {
    const parsed = createPlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Geçersiz plan verisi.',
        { details: parsed.error.flatten() },
      );
    }
    return this.admin.createPlan(parsed.data);
  }

  @Patch('plans/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plan güncelle' })
  async updatePlan(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz plan ID.');
    }
    const bodyParsed = updatePlanSchema.safeParse(body);
    if (!bodyParsed.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Geçersiz güncelleme verisi.',
        { details: bodyParsed.error.flatten() },
      );
    }
    return this.admin.updatePlan(idParsed.data, bodyParsed.data);
  }

  @Delete('plans/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Planı deaktif et (soft delete)' })
  async deactivatePlan(@Param('id') id: string): Promise<unknown> {
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz plan ID.');
    }
    return this.admin.deactivatePlan(idParsed.data);
  }

  // ─────────────────────────────────────────────────────────────
  // SUBSCRIPTION YÖNETİMİ
  // ─────────────────────────────────────────────────────────────

  @Get('subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tüm subscription\'ları listele' })
  async listSubscriptions(
    @Query('status') status?: string,
    @Query('plan') plan?: string,
  ): Promise<unknown> {
    return this.admin.listSubscriptions({ status, plan });
  }

  @Post('subscriptions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subscription iptal et' })
  async cancelSubscription(
    @Param('id') id: string,
    @Body() body: { reason?: string; refund?: boolean },
  ): Promise<unknown> {
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz subscription ID.');
    }
    return this.admin.cancelSubscription(
      idParsed.data,
      body?.reason,
      body?.refund ?? false,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // AUDIT LOG
  // ─────────────────────────────────────────────────────────────

  @Get('audit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Audit log sorgula (süper admin)' })
  async auditLog(@Query() raw: Record<string, string | undefined>): Promise<unknown> {
    const parsed = auditQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Geçersiz sorgu parametreleri.',
        { details: parsed.error.flatten() },
      );
    }
    return this.admin.queryAuditLog(parsed.data);
  }
}
