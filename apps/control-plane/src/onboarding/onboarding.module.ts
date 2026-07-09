/**
 * Onboarding Module — Self-serve tenant signup.
 */
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { OnboardingController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';
import { OnboardingRepository } from './onboarding.repository.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { PlansModule } from '../plans/plans.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { ProvisioningModule } from '../provisioning/provisioning.module.js';

@Module({
  imports: [
    TenantsModule,
    PlansModule,
    SubscriptionsModule,
    ProvisioningModule,
    ThrottlerModule.forRoot([
      { name: 'signup', ttl: 60_000, limit: 5 },
    ]),
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingRepository],
  exports: [OnboardingService],
})
export class OnboardingModule {}