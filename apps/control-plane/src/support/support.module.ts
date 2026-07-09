/**
 * Super Admin Support Module.
 *
 * TicketService'i commerce-backend'den import eder (DB aynı).
 */
import { Module } from '@nestjs/common';
import { SupportController } from './support.controller.js';
import { TicketService } from '../../../commerce-backend/src/modules/support/ticket.service.js';

@Module({
  controllers: [SupportController],
  providers: [TicketService],
})
export class SuperAdminSupportModule {}
