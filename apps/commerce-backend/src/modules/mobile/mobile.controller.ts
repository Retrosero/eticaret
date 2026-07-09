/**
 * Mobile Controller — Mobile app için optimize endpoint'ler.
 *
 *   GET   /api/mobile/dashboard                     → Dashboard summary
 *   GET   /api/mobile/orders?status=pending         → Order listesi
 *   GET   /api/mobile/orders/:id                    → Order detayı
 *   PATCH /api/mobile/orders/:id/status             → Durum güncelle
 *   GET   /api/mobile/products?lowStock=true        → Ürün listesi
 *   PATCH /api/mobile/products/:id/stock            → Stok güncelle
 *   POST  /api/mobile/push/register                 → Push token kaydet
 *   POST  /api/mobile/push/unregister               → Push token sil
 */
import {
  Body,
  Controller,
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
import { ApiError, ErrorCode } from '@eticart/config';

import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { MobileService } from './mobile.service.js';

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']),
  note: z.string().max(500).optional(),
});

const updateStockSchema = z.object({
  stock: z.number().int().min(0).max(999_999),
});

const registerPushSchema = z.object({
  token: z.string().min(10).max(200),
  platform: z.enum(['ios', 'android']),
});

@ApiTags('Mobile App')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mobile')
export class MobileController {
  constructor(private readonly mobile: MobileService) {}

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mobile dashboard summary' })
  dashboard(@CurrentUser() user: { tenantId: string }): Promise<unknown> {
    return this.mobile.getDashboard(user.tenantId);
  }

  // ─── ORDERS ───

  @Get('orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sipariş listesi (mobil)' })
  listOrders(
    @CurrentUser() user: { tenantId: string },
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    return this.mobile.listOrders(user.tenantId, status, limit ? parseInt(limit, 10) : 50);
  }

  @Get('orders/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sipariş detayı' })
  orderDetail(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.mobile.getOrderDetail(user.tenantId, id);
  }

  @Patch('orders/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sipariş durumunu güncelle' })
  async updateStatus(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz status.');
    }
    return this.mobile.updateOrderStatus(user.tenantId, id, parsed.data.status, parsed.data.note);
  }

  // ─── PRODUCTS ───

  @Get('products')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ürün listesi (mobil)' })
  listProducts(
    @CurrentUser() user: { tenantId: string },
    @Query('lowStock') lowStock?: string,
  ): Promise<unknown> {
    return this.mobile.listProducts(user.tenantId, { lowStock: lowStock === 'true' });
  }

  @Patch('products/:id/stock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ürün stoğunu güncelle' })
  async updateStock(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = updateStockSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz stok değeri.');
    }
    return this.mobile.updateStock(user.tenantId, id, parsed.data.stock);
  }

  // ─── PUSH ───

  @Post('push/register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Push token kaydet' })
  async registerPush(
    @CurrentUser() user: { tenantId: string; sub: string },
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = registerPushSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz push token.');
    }
    return this.mobile.registerPushToken(
      user.tenantId,
      user.sub,
      parsed.data.token,
      parsed.data.platform,
    );
  }

  @Post('push/unregister')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Push token sil' })
  async unregisterPush(
    @CurrentUser() user: { tenantId: string },
    @Body() body: { token: string },
  ): Promise<unknown> {
    return this.mobile.unregisterPushToken(user.tenantId, body.token);
  }
}