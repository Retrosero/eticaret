/**
 * Fatura (Invoice) Controller — REST API.
 *
 * İki controller tek dosyada:
 *  - /api/admin/invoices           → admin (tenant_admin, accountant)
 *  - /api/store/customer/invoices  → müşteri kendi faturaları
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

import {
  cancelInvoice,
  createInvoice,
  listCustomerInvoices,
  listOrderInvoices,
  refreshInvoiceStatus,
  resendInvoiceToGib,
} from './invoice-service.js';
import {
  CancelInvoiceSchema,
  CreateInvoiceSchema,
  PaginationSchema,
  type CancelInvoiceInput,
  type CreateInvoiceInput,
  type PaginationInput,
} from './invoice.dto.js';

// ===========================================================================
// Admin Fatura Controller
// ===========================================================================

@Controller('api/admin/invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tenant_admin', 'accountant')
export class AdminInvoiceController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /** Belirli bir siparişin faturalarını listeler. */
  @Get()
  async list(
    @Query('orderId') orderId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    if (!orderId) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'orderId sorgu parametresi zorunludur.',
      );
    }
    return listOrderInvoices(this.prisma.client, tenantId, orderId);
  }

  /** Tek fatura detayı. */
  @Get(':id')
  async detail(
    @Param('id') invoiceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const invoice = await this.prisma.client.orderInvoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Fatura bulunamadı.');
    }
    return invoice;
  }

  /** Yeni fatura oluşturur. */
  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(CreateInvoiceSchema)) body: CreateInvoiceInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    return createInvoice(this.prisma.client, {
      tenantId,
      orderId: body.orderId,
      type: body.type as never,
      customerTaxId: body.customerTaxId ?? null,
      customerTaxOffice: body.customerTaxOffice ?? null,
      customerCompanyName: body.customerCompanyName ?? null,
      notes: body.notes ?? null,
    });
  }

  /** Faturayı iptal eder. */
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @Param('id') invoiceId: string,
    @Body(new ZodValidationPipe(CancelInvoiceSchema)) body: CancelInvoiceInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    await cancelInvoice(this.prisma.client, tenantId, invoiceId, body.reason);
    return { ok: true };
  }

  /** e-Faturayı GİB'e yeniden gönderir (hata durumunda). */
  @Post(':id/resend')
  @HttpCode(200)
  async resend(
    @Param('id') invoiceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ status: string; errorMessage?: string }> {
    const tenantId = this.resolveTenant(req);
    return resendInvoiceToGib(this.prisma.client, tenantId, invoiceId);
  }

  /** GİB'den güncel durumu çeker. */
  @Post(':id/refresh-status')
  @HttpCode(200)
  async refreshStatus(
    @Param('id') invoiceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ status: string; gibReference?: string }> {
    const tenantId = this.resolveTenant(req);
    return refreshInvoiceStatus(this.prisma.client, tenantId, invoiceId);
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

// ===========================================================================
// Müşteri Fatura Controller
// ===========================================================================

@Controller('api/store/customer/invoices')
@UseGuards(JwtAuthGuard)
export class CustomerInvoiceController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /** Müşterinin kendi faturaları. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const customerId = req.user?.sub;
    if (!customerId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Müşteri kimliği bulunamadı.');
    }
    return listCustomerInvoices(
      this.prisma.client,
      tenantId,
      customerId,
      query.page,
      query.pageSize,
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