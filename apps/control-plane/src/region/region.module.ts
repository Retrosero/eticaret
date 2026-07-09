/**
 * Region Module.
 */
import { Module } from '@nestjs/common';
import { RegionController } from './region.controller.js';
import { RegionMiddleware } from './region.middleware.js';

@Module({
  controllers: [RegionController],
  providers: [RegionMiddleware],
  exports: [RegionMiddleware],
})
export class RegionModule {}