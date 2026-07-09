/**
 * B2B Credit Limit modülü.
 */

import { Module } from '@nestjs/common';

import { CreditLimitController } from './credit-limit.controller.js';

@Module({
  controllers: [CreditLimitController],
})
export class CreditLimitModule {}