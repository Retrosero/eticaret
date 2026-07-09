/**
 * B2B Kredi Limiti Controller — REST API.
 *
 * Endpoint'ler (Faz 9):
 *  - GET  /api/b2b/credit-limits/:companyAccountId → mevcut limit
 *  - PUT  /api/b2b/credit-limits/:companyAccountId → setCreditLimit (admin)
 *  - POST /api/b2b/credit-limits/check             → checkCreditAvailability
 *
 * tenant_admin için tam yetki; dealer kendi firmasının limitini okuyabilir.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
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

import {
  checkCreditAvailability,
  setCreditLimit,
} from './credit-limit-service.js';
import {
  CheckCreditSchema,
  SetCreditLimitSchema,
  type CheckCreditInput,
  type SetCreditLimitInput,
} from './credit-limit.dto.js';

@Controller('api/b2b/credit-limits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dealer', 'tenant_admin')
export class CreditLimitController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /** Belirli bir firma için kredi limiti geçmişini getirir. */
  @Get(':companyAccountId/history')
  async history(
    @Param('companyAccountId') companyAccountId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const rows = await this.prisma.client.creditLimitHistory.findMany({
      where: { tenantId, companyAccountId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows;
  }

  /**
   * Kredi limiti tanımla/güncelle. Yalnızca tenant_admin veya
   * finans yöneticisi tarafından çağrılmalıdır.
   */
  @Put(':companyAccountId')
  @HttpCode(200)
  async set(
    @Param('companyAccountId') companyAccountId: string,
    @Body(new ZodValidationPipe(SetCreditLimitSchema.omit({ companyAccountId: true })))
    body: Omit<SetCreditLimitInput, 'companyAccountId'>,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const role = req.user?.role;
    if (role !== 'tenant_admin' && role !== 'accountant') {
      throw new ApiError(
        403,
        ErrorCode.FORBIDDEN,
        'Kredi limiti yalnızca tenant_admin/accountant tarafından değiştirilebilir.',
      );
    }
    return setCreditLimit(this.prisma.client, {
      tenantId,
      companyAccountId,
      limitAmount: body.limitAmount,
      paymentTermDays: body.paymentTermDays,
      autoApproveUnderLimit: body.autoApproveUnderLimit,
    });
  }

  /** Sipariş öncesi kredi kontrolü. */
  @Post('check')
  @HttpCode(200)
  async check(
    @Body(new ZodValidationPipe(CheckCreditSchema)) body: CheckCreditInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    return checkCreditAvailability(
      this.prisma.client,
      tenantId,
      body.companyAccountId,
      body.requestedAmount,
    );
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