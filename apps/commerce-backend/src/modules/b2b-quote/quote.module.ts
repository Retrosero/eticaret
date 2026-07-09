/**
 * B2B Quote modülü.
 */

import { Module } from '@nestjs/common';

import { QuoteController } from './quote.controller.js';

@Module({
  controllers: [QuoteController],
})
export class QuoteModule {}