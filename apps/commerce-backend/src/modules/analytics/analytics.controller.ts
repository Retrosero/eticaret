/**
 * Analytics REST Controller.
 *
 * Endpoint'ler:
 *   GET /analytics/overview              → Sales overview
 *   GET /analytics/top-products          → Top products
 *   GET /analytics/top-categories        → Top categories
 *   GET /analytics/cohort                → Customer cohort
 *   GET /analytics/funnel                → Conversion funnel
 *   GET /analytics/channels              → Revenue by channel
 *   GET /analytics/realtime              → Real-time stats
 *   GET /analytics/export/orders         → CSV export
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';
import type { Response } from 'express';

import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { AnalyticsService, type AnalyticsRange } from './analytics.service.js';

const rangeSchema = z.enum(['24h', '7d', '30d', '90d', '1y', 'all']);
const limitSchema = z.coerce.number().int().min(1).max(100).default(10);

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Satış özeti' })
  async overview(
    @CurrentUser() user: { tenantId: string },
    @Query('range') range?: string,
  ): Promise<unknown> {
    const r = this.parseRange(range);
    return this.analytics.getSalesOverview(user.tenantId, r);
  }

  @Get('top-products')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'En çok satan ürünler' })
  async topProducts(
    @CurrentUser() user: { tenantId: string },
    @Query('range') range?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    const r = this.parseRange(range);
    const l = this.parseLimit(limit);
    return this.analytics.getTopProducts(user.tenantId, r, l);
  }

  @Get('top-categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'En çok satan kategoriler' })
  async topCategories(
    @CurrentUser() user: { tenantId: string },
    @Query('range') range?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    const r = this.parseRange(range);
    const l = this.parseLimit(limit);
    return this.analytics.getTopCategories(user.tenantId, r, l);
  }

  @Get('cohort')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Müşteri cohort (retention) analizi' })
  async cohort(
    @CurrentUser() user: { tenantId: string },
    @Query('months') months?: string,
  ): Promise<unknown> {
    const m = z.coerce.number().int().min(1).max(24).default(12).safeParse(months);
    if (!m.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz months.');
    }
    return this.analytics.getCustomerCohort(user.tenantId, m.data);
  }

  @Get('funnel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Conversion funnel' })
  async funnel(
    @CurrentUser() user: { tenantId: string },
    @Query('range') range?: string,
  ): Promise<unknown> {
    const r = this.parseRange(range);
    return this.analytics.getConversionFunnel(user.tenantId, r);
  }

  @Get('channels')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kanal bazlı gelir' })
  async channels(
    @CurrentUser() user: { tenantId: string },
    @Query('range') range?: string,
  ): Promise<unknown> {
    const r = this.parseRange(range);
    return this.analytics.getRevenueByChannel(user.tenantId, r);
  }

  @Get('realtime')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Real-time istatistikler (son 1 saat)' })
  async realtime(
    @CurrentUser() user: { tenantId: string },
  ): Promise<unknown> {
    return this.analytics.getRealtimeStats(user.tenantId);
  }

  @Get('export/orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Siparişleri CSV olarak export' })
  async exportOrders(
    @CurrentUser() user: { tenantId: string },
    @Query('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const r = this.parseRange(range);
    const csv = await this.analytics.exportOrdersCsv(user.tenantId, r);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="orders-${r}-${Date.now()}.csv"`,
    );
    res.send(csv);
  }

  private parseRange(range: string | undefined): AnalyticsRange {
    const parsed = rangeSchema.safeParse(range ?? '30d');
    if (!parsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz range.');
    }
    return parsed.data;
  }

  private parseLimit(limit: string | undefined): number {
    const parsed = limitSchema.safeParse(limit);
    if (!parsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz limit.');
    }
    return parsed.data;
  }
}
