/**
 * B2B Onay İş Akışı (Approval) Controller — REST API.
 *
 * Endpoint'ler (Faz 9):
 *  - GET  /api/admin/approvals/pending       → listPendingApprovals
 *  - POST /api/admin/approvals/:id/approve   → approveRequest
 *  - POST /api/admin/approvals/:id/reject    → rejectRequest
 *
 * Yalnızca tenant_admin rolündeki kullanıcılar erişebilir.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiError, ErrorCode } from '@eticart/config';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../../common/roles.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PrismaService, PRISMA_TOKEN } from '../../db/prisma.service.js';
import { NotificationService } from '../notification/notification-service.js';

import {
  approveRequest,
  listPendingApprovals,
  rejectRequest,
} from './approval-workflow-service.js';
import {
  ApproveSchema,
  RejectSchema,
  type ApproveInput,
  type RejectInput,
} from './approval.dto.js';
import { z } from 'zod';
import { uuidSchema } from '@eticart/validation';

const ListPendingQuerySchema = z.object({
  companyAccountId: uuidSchema.optional(),
});

@Controller('api/admin/approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tenant_admin')
export class ApprovalController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /** Açık (pending) onay taleplerini listeler. */
  @Get('pending')
  async listPending(
    @Query(new ZodValidationPipe(ListPendingQuerySchema))
    query: z.infer<typeof ListPendingQuerySchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    return listPendingApprovals(
      this.prisma.client,
      tenantId,
      query.companyAccountId ?? undefined,
    );
  }

  /** Onay talebini kabul eder. */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id') approvalId: string,
    @Body(new ZodValidationPipe(ApproveSchema)) body: ApproveInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const approverUserId = req.user?.sub;
    if (!approverUserId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Aktör kullanıcı kimliği yok.');
    }
    // Onay öncesi dealer bilgisi (e-posta için)
    const approvalInfo = await this.prisma.client.orderApproval.findFirst({
      where: { id: approvalId, tenantId },
      select: {
        companyAccount: {
          select: { legalName: true, tradeName: true, taxId: true },
        },
      },
    });

    // Dealer email'i DealerApplication tablosundan çek (taxId eşleşmesi)
    const dealerApp = approvalInfo?.companyAccount?.taxId
      ? await this.prisma.client.dealerApplication.findFirst({
          where: { tenantId, taxId: approvalInfo.companyAccount.taxId },
          select: { contactEmail: true, contactName: true },
        })
      : null;

    await approveRequest(
      this.prisma.client,
      tenantId,
      approvalId,
      approverUserId,
      body.note,
    );

    // Bayiye onay e-postası (fire-and-forget)
    const dealerEmail = dealerApp?.contactEmail;
    const dealerName = dealerApp?.contactName ?? approvalInfo?.companyAccount?.tradeName ?? approvalInfo?.companyAccount?.legalName ?? 'Bayi';
    if (dealerEmail) {
      try {
        await NotificationService.enqueueDealerApproved({
          tenantId,
          dealerEmail,
          dealerName,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[approval.approve] notification enqueue failed:', (err as Error).message);
      }
    }
    return { ok: true };
  }

  /** Onay talebini reddeder. */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id') approvalId: string,
    @Body(new ZodValidationPipe(RejectSchema)) body: RejectInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const approverUserId = req.user?.sub;
    if (!approverUserId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Aktör kullanıcı kimliği yok.');
    }
    await rejectRequest(
      this.prisma.client,
      tenantId,
      approvalId,
      approverUserId,
      body.reason,
    );
    return { ok: true };
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