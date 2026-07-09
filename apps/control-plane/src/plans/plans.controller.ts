/**
 * Plans REST controller.
 *
 * Public endpoint — landing page'de fiyat listesi için kullanılır.
 * Auth gerektirmez (public pricing page).
 *
 * GET /plans         → Aktif plan listesi
 * GET /plans/:code   → Plan detayı
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';
import { PlansService } from './plans.service.js';

@ApiTags('Planlar (Public)')
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /**
   * Public plan listesi — landing page / pricing için.
   * Sıralama: sort_order ASC.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aktif plan listesi (public, auth gerekmez)',
  })
  @ApiOkResponse({ description: 'Sıralı plan listesi.' })
  async list(): Promise<{ items: unknown[]; updatedAt: string }> {
    const items = await this.plans.listActive();
    return {
      items: await Promise.all(
        items.map(async (p) => {
          const detail = await this.plans.findWithFeatures(p.code);
          return {
            code: p.code,
            name: p.name,
            description: p.description,
            monthlyPriceKurus: p.monthlyPriceKurus,
            yearlyPriceKurus: p.yearlyPriceKurus,
            currency: p.currency,
            trialDays: p.trialDays,
            maxUsers: p.maxUsers,
            maxProducts: p.maxProducts,
            maxOrdersPerMonth: p.maxOrdersPerMonth,
            maxStorageBytes: p.maxStorageBytes,
            features:
              detail?.features.map((f) => ({
                key: f.featureKey,
                enabled: f.enabled,
                limit: f.limitValue,
              })) ?? [],
          };
        })
      ),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Plan detayı (public).
   */
  @Get(':code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plan detayı (public)' })
  async detail(@Param('code') code: string): Promise<unknown> {
    const validated = z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9_-]+$/)
      .safeParse(code);
    if (!validated.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz plan kodu.');
    }
    const plan = await this.plans.findWithFeatures(validated.data as any);
    if (!plan) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Plan bulunamadı.');
    }
    return {
      plan: plan.plan,
      features: plan.features,
    };
  }
}