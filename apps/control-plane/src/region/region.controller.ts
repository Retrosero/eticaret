/**
 * Region Controller — Public region listesi + health check.
 */
import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  REGIONS,
  ALL_REGION_CODES,
  FailoverManager,
  type RegionCode,
  type RegionHealth,
} from '@eticart/region-router';

@ApiTags('Region')
@Controller('regions')
export class RegionController {
  private failover = new FailoverManager();

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tüm region\'ları listele (public)' })
  list(): unknown {
    return {
      regions: Object.values(REGIONS).map((r) => ({
        code: r.code,
        name: r.name,
        city: r.city,
        country: r.country,
        defaultLocale: r.defaultLocale,
        dataResidencyRequired: r.dataResidencyRequired,
        regulatory: r.regulatory,
      })),
      total: ALL_REGION_CODES.length,
    };
  }

  @Get(':code/health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Region sağlık durumu' })
  async health(@Param('code') code: string): Promise<unknown> {
    const r = await this.failover.checkRegion(code as RegionCode);
    return r;
  }

  @Get('health/all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tüm region\'ların sağlık durumu' })
  async allHealth(): Promise<{ regions: RegionHealth[] }> {
    await this.failover.checkAll();
    return { regions: Array.from(this.failover.getHealth().values()) };
  }
}