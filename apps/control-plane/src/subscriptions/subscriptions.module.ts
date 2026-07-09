/**
 * Subscriptions modülü.
 */

import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { PlansModule } from '../plans/plans.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [PlansModule, AuditModule],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}