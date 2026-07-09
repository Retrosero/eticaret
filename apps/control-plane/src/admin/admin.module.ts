/**
 * Admin Module — SSO + User Management.
 */
import { Module, Global } from '@nestjs/common';
import { SsoController, AdminController } from './admin.controller.js';
import { SsoService } from './sso.service.js';
import { PermissionGuard } from './permission.guard.js';

@Global()
@Module({
  controllers: [SsoController, AdminController],
  providers: [SsoService, PermissionGuard],
  exports: [SsoService, PermissionGuard],
})
export class AdminModule {}
