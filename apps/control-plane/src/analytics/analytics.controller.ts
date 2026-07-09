/**
 * Analytics Controller.
 */
import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('Tenant Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('tenants')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform-wide tenant analytics' })
  getTenantAnalytics(): Promise<unknown> {
    return this.analytics.getTenantAnalytics();
  }

  @Get('tenants/:id/engagement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tek tenant engagement score' })
  getEngagement(@Param('id') id: string): Promise<unknown> {
    return this.analytics.getEngagementScore(id);
  }
}