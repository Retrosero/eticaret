/**
 * Support Module — Ticket sistemi.
 */
import { Module } from '@nestjs/common';
import { TicketController } from './ticket.controller.js';
import { TicketService } from './ticket.service.js';

@Module({
  controllers: [TicketController],
  providers: [TicketService],
  exports: [TicketService],
})
export class SupportModule {}
