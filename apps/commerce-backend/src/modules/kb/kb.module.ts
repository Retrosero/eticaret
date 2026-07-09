/**
 * KB Module.
 */
import { Module } from '@nestjs/common';
import { KbPublicController, KbAdminController } from './kb.controller.js';
import { KbService } from './kb.service.js';

@Module({
  controllers: [KbPublicController, KbAdminController],
  providers: [KbService],
  exports: [KbService],
})
export class KbModule {}