/**
 * TenantsModule — placeholder.
 * Faz 2'de gerçek tenant CRUD endpoint'leri eklenecek.
 */

import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller.js';

@Module({
  controllers: [TenantsController],
})
export class TenantsModule {}
