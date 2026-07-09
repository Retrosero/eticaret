/**
 * AI Module — EtiCart AI özellikleri.
 */
import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiBackendService } from './ai.service.js';

@Module({
  controllers: [AiController],
  providers: [AiBackendService],
  exports: [AiBackendService],
})
export class AiModule {}