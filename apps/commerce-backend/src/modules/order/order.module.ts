/**
 * Order modülü — admin + müşteri controller'ları.
 */

import { Module } from '@nestjs/common';

import {
  AdminOrderController,
  CustomerOrderController,
} from './order.controller.js';

@Module({
  controllers: [AdminOrderController, CustomerOrderController],
})
export class OrderModule {}