/**
 * Invoice modülü — admin + müşteri controller'ları.
 */

import { Module } from '@nestjs/common';

import {
  AdminInvoiceController,
  CustomerInvoiceController,
} from './invoice.controller.js';

@Module({
  controllers: [AdminInvoiceController, CustomerInvoiceController],
})
export class InvoiceModule {}