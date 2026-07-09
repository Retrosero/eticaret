/**
 * Support Ticket REST Controller (tenant tarafı).
 *
 * Endpoint'ler:
 *   GET    /support/tickets           → Tenant'ın ticket'ları
 *   POST   /support/tickets           → Yeni ticket oluştur
 *   GET    /support/tickets/:id       → Ticket detayı
 *   GET    /support/tickets/:id/messages → Mesajlar
 *   POST   /support/tickets/:id/messages → Mesaj gönder
 *   POST   /support/tickets/:id/close    → Kapat
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';

import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { TicketService, type TicketCategory, type TicketPriority } from './ticket.service.js';

const createTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  description: z.string().min(10).max(10000),
  category: z.enum([
    'general',
    'billing',
    'technical',
    'feature_request',
    'bug_report',
    'integration',
    'other',
  ]) as z.ZodType<TicketCategory>,
  priority: z
    .enum(['low', 'normal', 'high', 'urgent'])
    .default('normal') as z.ZodType<TicketPriority>,
  tags: z.array(z.string().max(50)).max(10).optional(),
});

const addMessageSchema = z.object({
  body: z.string().min(1).max(10000),
  attachments: z.array(z.string().url()).max(5).optional(),
});

const listQuerySchema = z.object({
  status: z
    .enum([
      'open',
      'assigned',
      'in_progress',
      'waiting_customer',
      'resolved',
      'closed',
    ])
    .optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  category: z
    .enum([
      'general',
      'billing',
      'technical',
      'feature_request',
      'bug_report',
      'integration',
      'other',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

@ApiTags('Support Tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support/tickets')
export class TicketController {
  constructor(private readonly tickets: TicketService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mevcut tenant\'ın ticket\'ları' })
  async list(
    @CurrentUser() user: { tenantId: string; email: string; name: string },
    @Query() raw: Record<string, string | undefined>,
  ): Promise<unknown> {
    const parsed = listQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz sorgu.');
    }
    return this.tickets.listTickets(user.tenantId, parsed.data);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni ticket oluştur' })
  async create(
    @CurrentUser() user: { tenantId: string; email: string; name: string },
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = createTicketSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Geçersiz ticket verisi.',
        { details: parsed.error.flatten() },
      );
    }
    return this.tickets.createTicket({
      tenantId: user.tenantId,
      subject: parsed.data.subject,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: parsed.data.priority,
      customerEmail: user.email,
      customerName: user.name,
      tags: parsed.data.tags,
    });
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ticket detayı' })
  async getOne(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ): Promise<unknown> {
    const ticket = await this.tickets.getTicket(id, user.tenantId);
    if (!ticket) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ticket bulunamadı.');
    }
    return ticket;
  }

  @Get(':id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ticket mesajları' })
  async getMessages(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ): Promise<unknown> {
    const ticket = await this.tickets.getTicket(id, user.tenantId);
    if (!ticket) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ticket bulunamadı.');
    }
    return this.tickets.getMessages(id, false);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ticket\'a mesaj ekle' })
  async addMessage(
    @CurrentUser() user: { tenantId: string; email: string; name: string },
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = addMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Geçersiz mesaj.',
      );
    }
    const ticket = await this.tickets.getTicket(id, user.tenantId);
    if (!ticket) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ticket bulunamadı.');
    }
    return this.tickets.addMessage({
      ticketId: id,
      authorType: 'customer',
      authorId: null,
      authorEmail: user.email,
      authorName: user.name,
      body: parsed.data.body,
      attachments: parsed.data.attachments,
    });
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ticket\'ı kapat' })
  async close(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ): Promise<unknown> {
    const ticket = await this.tickets.getTicket(id, user.tenantId);
    if (!ticket) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ticket bulunamadı.');
    }
    if (ticket.status === 'closed') {
      throw new ApiError(
        409,
        ErrorCode.CONFLICT,
        'Ticket zaten kapalı.',
      );
    }
    return this.tickets.updateStatus(id, 'closed');
  }
}
