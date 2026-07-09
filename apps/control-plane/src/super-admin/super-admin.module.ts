/**
 * Süper admin modülü — platform yönetim controller + service.
 *
 * Faz 17: Super admin dashboard, tenant yönetim, plan yönetim,
 * subscription yönetim, audit log.
 */
import { Module, Global } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller.js';
import { SuperAdminService } from './super-admin.service.js';
import { SuperAdminGuard } from './super-admin.guard.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { PlansModule } from '../plans/plans.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Global()
@Module({
  imports: [TenantsModule, PlansModule, SubscriptionsModule, AuditModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, SuperAdminGuard],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
