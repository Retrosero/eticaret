/**
 * Audit REST controller.
 *
 * Admin kullanıcıları kendi tenant'larının audit loglarını sorgulayabilir.
 * Cross-tenant erişim engellenir.
 */
import {
  Controller,
  Get,
  Inject,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../../common/roles.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PrismaService, PRISMA_TOKEN } from '../../db/prisma.service.js';

const ListAuditQuerySchema = z.object({
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  action: z.string().max(80).optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

@Controller('api/admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tenant_admin')
export class AuditController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /**
   * Tenant'a ait audit logları listeler.
   */
  @Get()
  async list(
    @Query(new ZodValidationPipe(ListAuditQuerySchema))
    query: z.infer<typeof ListAuditQuerySchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);

    const where: any = { tenantId };
    if (query.severity) where.severity = query.severity;
    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;

    const [items, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          tenantId: true,
          userId: true,
          customerId: true,
          action: true,
          severity: true,
          ip: true,
          userAgent: true,
          correlationId: true,
          path: true,
          method: true,
          context: true,
          occurredAt: true,
        },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * Severity bazlı istatistik (son 24 saat).
   */
  @Get('stats')
  async stats(@Req() req: AuthenticatedRequest): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [info, warning, critical] = await Promise.all([
      this.prisma.client.auditLog.count({
        where: { tenantId, severity: 'info', occurredAt: { gte: since } },
      }),
      this.prisma.client.auditLog.count({
        where: { tenantId, severity: 'warning', occurredAt: { gte: since } },
      }),
      this.prisma.client.auditLog.count({
        where: { tenantId, severity: 'critical', occurredAt: { gte: since } },
      }),
    ]);

    return {
      window: '24h',
      info,
      warning,
      critical,
      total: info + warning + critical,
    };
  }

  private resolveTenant(req: AuthenticatedRequest): string {
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) {
      throw new ApiError(
        400,
        ErrorCode.TENANT_NOT_FOUND,
        'Tenant kimliği token içinde bulunamadı.',
      );
    }
    return tenantId;
  }
}