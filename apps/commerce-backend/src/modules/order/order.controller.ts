/**
 * Sipariş (Order) Controller — REST API.
 *
 * İki controller tek dosyada toplanmıştır:
 *  - /api/admin/orders           → admin yönetimi (tenant_admin, order_manager)
 *  - /api/store/customer/orders  → müşteri kendi siparişleri
 *
 * Yetkilendirme:
 *  - Admin endpoint'leri `@Roles('tenant_admin','order_manager')` ile korunur.
 *  - Müşteri endpoint'lerinde müşteri sadece kendi siparişlerini görebilir
 *    (servis katmanı `customerId` filtresi ile zaten bunu zorlar).
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
  cancelOrder,
  getOrderDetail,
  listOrders,
  startReturn,
  transitionOrderStatus,
} from './order-service.js';
import {
  CancelOrderSchema,
  ListOrdersQuerySchema,
  StartReturnSchema,
  TransitionOrderSchema,
  type CancelOrderInput,
  type ListOrdersQuery,
  type StartReturnInput,
  type TransitionOrderInput,
} from './order.dto.js';

// ===========================================================================
// Admin Sipariş Controller
// ===========================================================================

@Controller('api/admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tenant_admin', 'order_manager')
export class AdminOrderController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /** Tüm tenant siparişlerini listeler (filtre + sayfalama). */
  @Get()
  async list(
    @Query(new ZodValidationPipe(ListOrdersQuerySchema)) query: ListOrdersQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const status = Array.isArray(query.status)
      ? query.status
      : query.status
        ? [query.status]
        : undefined;
    return listOrders(this.prisma.client, {
      tenantId,
      status,
      search: query.search ?? null,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      order: query.order,
    });
  }

  /** Tek sipariş detayı. */
  @Get(':id')
  async detail(
    @Param('id') orderId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const order = await getOrderDetail(this.prisma.client, tenantId, orderId);
    if (!order) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Sipariş bulunamadı.');
    }
    return order;
  }

  /** Durum makinesi üzerinden durum geçişi yapar. */
  @Post(':id/transition')
  @HttpCode(200)
  async transition(
    @Param('id') orderId: string,
    @Body(new ZodValidationPipe(TransitionOrderSchema)) body: TransitionOrderInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const actorUserId = req.user?.sub;
    if (!actorUserId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Aktör kullanıcı kimliği yok.');
    }

    // Müşteri bilgisi (status e-postası için)
    const orderWithCustomer = await this.prisma.client.order.findFirst({
      where: { id: orderId, tenantId },
      select: {
        orderNumber: true,
        status: true,
        customer: { select: { email: true, fullName: true } },
      },
    });

    const result = await transitionOrderStatus(
      this.prisma.client,
      tenantId,
      orderId,
      body.toStatus as never,
      actorUserId,
      body.reason,
    );

    // Müşteriye durum değişikliği e-postası (fire-and-forget)
    if (orderWithCustomer?.customer?.email) {
      try {
        await NotificationService.enqueueOrderStatusChanged({
          tenantId,
          orderId,
          orderNumber: orderWithCustomer.orderNumber,
          customerEmail: orderWithCustomer.customer.email,
          customerName: orderWithCustomer.customer.fullName,
          oldStatus: orderWithCustomer.status,
          newStatus: body.toStatus as never,
        });
      } catch (err) {
        // Notification hatası ana akışı engellemez
        // eslint-disable-next-line no-console
        console.error('[order.transition] notification enqueue failed:', (err as Error).message);
      }
    }

    return result;
  }

  /** Siparişi iptal eder. */
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @Param('id') orderId: string,
    @Body(new ZodValidationPipe(CancelOrderSchema)) body: CancelOrderInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const actorUserId = req.user?.sub;
    if (!actorUserId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Aktör kullanıcı kimliği yok.');
    }
    await cancelOrder(this.prisma.client, tenantId, orderId, actorUserId, body.reason);
    return { ok: true };
  }

  /** İade süreci başlatır. */
  @Post(':id/return')
  @HttpCode(200)
  async startReturn(
    @Param('id') orderId: string,
    @Body(new ZodValidationPipe(StartReturnSchema)) body: StartReturnInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const actorUserId = req.user?.sub;
    if (!actorUserId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Aktör kullanıcı kimliği yok.');
    }
    await startReturn(this.prisma.client, tenantId, orderId, actorUserId, body.reason);
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

// ===========================================================================
// Müşteri Sipariş Controller
// ===========================================================================

@Controller('api/store/customer/orders')
@UseGuards(JwtAuthGuard)
export class CustomerOrderController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /** Müşterinin kendi siparişleri. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(ListOrdersQuerySchema)) query: ListOrdersQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const customerId = req.user?.sub;
    if (!customerId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Müşteri kimliği bulunamadı.');
    }
    const status = Array.isArray(query.status)
      ? query.status
      : query.status
        ? [query.status]
        : undefined;
    return listOrders(this.prisma.client, {
      tenantId,
      customerId,
      status,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      order: query.order,
    });
  }

  /** Müşterinin kendi sipariş detayı. */
  @Get(':id')
  async detail(
    @Param('id') orderId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const customerId = req.user?.sub;
    if (!customerId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Müşteri kimliği bulunamadı.');
    }
    const order = await getOrderDetail(this.prisma.client, tenantId, orderId);
    if (!order || order.customerId !== customerId) {
      // Müşteri başka birinin siparişine erişmeye çalışıyor → 404 (sızdırma yok).
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Sipariş bulunamadı.');
    }
    return order;
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