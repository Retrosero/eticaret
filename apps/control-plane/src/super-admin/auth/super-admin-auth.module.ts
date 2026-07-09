/**
 * Super admin auth modülü — controller ve service'i DI'ya bağlar.
 *
 * AuthModule'deki global servisleri kullanır; ek bir store inject edilmez.
 */

import { Module } from '@nestjs/common';

import { SuperAdminAuthController } from './super-admin-auth.controller.js';
import { SuperAdminAuthService } from './services/super-admin-auth.service.js';

@Module({
  controllers: [SuperAdminAuthController],
  providers: [SuperAdminAuthService],
  exports: [SuperAdminAuthService],
})
export class SuperAdminAuthModule {}