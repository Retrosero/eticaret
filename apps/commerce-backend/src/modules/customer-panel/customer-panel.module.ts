/**
 * Customer Panel modülü.
 */

import { Module } from '@nestjs/common';

import { CustomerPanelController } from './customer-panel.controller.js';

@Module({
  controllers: [CustomerPanelController],
})
export class CustomerPanelModule {}