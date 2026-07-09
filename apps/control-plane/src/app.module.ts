/**
 * Control-plane kök modülü.
 *
 * Faz 1: Health + Tenants (placeholder)
 * Faz 14: Onboarding (self-serve signup), Plans public API
 */

import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { HealthModule } from './health/health.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { OnboardingModule } from './onboarding/onboarding.module.js';
import { SuperAdminModule } from './super-admin/super-admin.module.js';
import { SuperAdminSupportModule } from './support/support.module.js';
import { AdminModule } from './admin/admin.module.js';
import { RegionModule } from './region/region.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { PlansModule } from './plans/plans.module.js';
import { CommonModule } from './common/common.module.js';
import { ConfigRootModule } from './config/config.module.js';

@Module({
  imports: [
    ConfigRootModule,
    CommonModule,
    HealthModule,
    TenantsModule,
    PlansModule,
    OnboardingModule,
    SuperAdminModule,
    SuperAdminSupportModule,
    AdminModule,
    RegionModule,
    AnalyticsModule,
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env['RATE_LIMIT_TTL'] ?? 60) * 1000,
        limit: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
      },
    ]),
  ],
})
export class AppModule {}