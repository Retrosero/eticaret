/**
 * Features modülü.
 */

import { Module } from '@nestjs/common';
import { FeaturesService } from './features.service.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuditModule],
  providers: [FeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}