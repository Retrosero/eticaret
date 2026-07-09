/**
 * Mobile Module — Mobile app backend.
 */
import { Module } from '@nestjs/common';
import { MobileController } from './mobile.controller.js';
import { MobileService } from './mobile.service.js';

@Module({
  controllers: [MobileController],
  providers: [MobileService],
  exports: [MobileService],
})
export class MobileModule {}