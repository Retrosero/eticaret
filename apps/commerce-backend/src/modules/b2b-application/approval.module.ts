/**
 * B2B Approval modülü.
 */

import { Module } from '@nestjs/common';

import { ApprovalController } from './approval.controller.js';

@Module({
  controllers: [ApprovalController],
})
export class ApprovalModule {}