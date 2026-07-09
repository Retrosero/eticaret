/**
 * B2B Teklif (Quote) Controller — REST API.
 *
 * Endpoint'ler (Faz 9):
 *  - GET    /api/b2b/quotes            → bayi teklifleri (DealerContext zorunlu)
 *  - POST   /api/b2b/quotes            → yeni teklif taslağı
 *  - POST   /api/b2b/quotes/:id/items  → kalem ekle
 *  - POST   /api/b2b/quotes/:id/send   → müşteriye gönder
 *  - POST   /api/b2b/quotes/:id/accept → kabul et
 *  - POST   /api/b2b/quotes/:id/reject → reddet
 *  - POST   /api/b2b/quotes/:id/convert→ siparişe dönüştür
 *
 * Dealer (bayi) kullanıcıları zorunludur. `resolveDealerContext`
 * tenant + companyAccountId izolasyonunu sağlar; admin baypası
 * için `tenantAdminBypass` flag'i kullanılabilir.
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
import type { PrismaClient } from '@prisma/client';
import { ApiError, ErrorCode } from '@eticart/config';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../../common/roles.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PrismaService, PRISMA_TOKEN } from '../../db/prisma.service.js';
import { resolveDealerContext } from '../common/dealer-context.js';

import {
  acceptQuote,
  addQuoteItem,
  convertQuoteToOrder,
  createQuote,
  rejectQuote,
  sendQuote,
} from './quote-service.js';
import {
  AddQuoteItemSchema,
  CreateQuoteSchema,
  ListQuotesQuerySchema,
  RejectQuoteSchema,
  type AddQuoteItemInput,
  type CreateQuoteInput,
  type ListQuotesQuery,
  type RejectQuoteInput,
} from './quote.dto.js';

@Controller('api/b2b/quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dealer', 'tenant_admin')
export class QuoteController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /** Bayi tekliflerini listeler. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(ListQuotesQuerySchema)) query: ListQuotesQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const ctx = await this.resolveDealer(req);
    const where: Parameters<PrismaClient['quote']['findMany']>[0] = {
      where: {
        tenantId: ctx.tenantId,
        companyAccountId: ctx.companyAccountId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    };
    const [items, total] = await Promise.all([
      this.prisma.client.quote.findMany(where),
      this.prisma.client.quote.count({ where: where.where }),
    ]);
    return { items, total };
  }

  /** Yeni teklif taslağı oluşturur. */
  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(CreateQuoteSchema)) body: CreateQuoteInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const ctx = await this.resolveDealer(req);
    return createQuote(this.prisma.client, {
      tenantId: ctx.tenantId,
      companyAccountId: ctx.companyAccountId,
      createdById: ctx.userId,
      title: body.title ?? body.customerCompanyName ?? 'Teklif',
      salesRepId: body.salesRepId,
      validUntil: body.validUntil,
      notes: body.notes,
    });
  }

  /** Teklife kalem ekler. */
  @Post(':id/items')
  @HttpCode(201)
  async addItem(
    @Param('id') quoteId: string,
    @Body(new ZodValidationPipe(AddQuoteItemSchema)) body: AddQuoteItemInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const ctx = await this.resolveDealer(req);
    return addQuoteItem(this.prisma.client, {
      tenantId: ctx.tenantId,
      quoteId,
      productId: body.productId,
      variantId: body.variantId ?? null,
      skuSnapshot: body.sku ?? body.skuSnapshot ?? '',
      productTitle: body.name ?? body.productTitle ?? 'Ürün',
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      discountPercent: body.discountPercent,
    });
  }

  /** Teklifi müşteriye gönderir. */
  @Post(':id/send')
  @HttpCode(200)
  async send(
    @Param('id') quoteId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const ctx = await this.resolveDealer(req);
    await sendQuote(this.prisma.client, ctx.tenantId, quoteId);
    return { ok: true };
  }

  /** Müşteri kabul eder. */
  @Post(':id/accept')
  @HttpCode(200)
  async accept(
    @Param('id') quoteId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const ctx = await this.resolveDealer(req);
    await acceptQuote(this.prisma.client, ctx.tenantId, quoteId);
    return { ok: true };
  }

  /** Müşteri reddeder. */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id') quoteId: string,
    @Body(new ZodValidationPipe(RejectQuoteSchema)) body: RejectQuoteInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const ctx = await this.resolveDealer(req);
    await rejectQuote(this.prisma.client, ctx.tenantId, quoteId, body.reason);
    return { ok: true };
  }

  /** Teklifi siparişe dönüştürür. */
  @Post(':id/convert')
  @HttpCode(200)
  async convert(
    @Param('id') quoteId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const ctx = await this.resolveDealer(req);
    return convertQuoteToOrder(this.prisma.client, ctx.tenantId, quoteId);
  }

  /**
   * Dealer (bayi) bağlamını çözer. tenant_admin rolündeyse bypass
   * yapılmaz; firma kapsamı için `companyAccountId` header ile alınabilir.
   */
  private async resolveDealer(req: AuthenticatedRequest): Promise<{
    tenantId: string;
    companyAccountId: string;
    userId: string;
  }> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Kullanıcı kimliği bulunamadı.');
    }
    const headerCompanyId = req.headers['x-company-account-id'] as string | undefined;
    const ctx = await resolveDealerContext(this.prisma.client, {
      userId,
      companyAccountId: headerCompanyId ?? null,
    });
    return {
      tenantId: ctx.tenantId as string,
      companyAccountId: ctx.companyAccountId as string,
      userId: ctx.userId as string,
    };
  }
}