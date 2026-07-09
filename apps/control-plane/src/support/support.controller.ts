/**
 * Super Admin Support Controller.
 *
 * Tüm tenant'ların ticket'larını yönetir.
 *
 * Endpoint'ler:
 *   GET   /api/v1/support/tickets              → Tüm ticket'lar
 *   GET   /api/v1/support/tickets/:id          → Detay
 *   GET   /api/v1/support/tickets/:id/messages → Mesajlar (internal dahil)
 *   POST  /api/v1/support/tickets/:id/messages → Admin cevabı
 *   POST  /api/v1/support/tickets/:id/assign   → Admin atama
 *   POST  /api/v1/support/tickets/:id/status   → Status değiştir
 *   GET   /api/v1/support/stats                → Platform istatistikleri
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
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { Inject } from '@nestjs/common';

import { RequireSuperAdmin } from '../super-admin/super-admin.guard.js';
import { LOGGER_TOKEN } from '../common/logger.js';
import { TicketService, type TicketStatus } from '../../../commerce-backend/src/modules/support/ticket.service.js';

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
  assignedTo: z.string().optional(),
  tenantId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const replySchema = z.object({
  body: z.string().min(1).max(10000),
  isInternal: z.boolean().default(false),
});

const assignSchema = z.object({
  adminEmail: z.string().email(),
  adminId: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum([
    'open',
    'assigned',
    'in_progress',
    'waiting_customer',
    'resolved',
    'closed',
  ]) as z.ZodType<TicketStatus>,
});

@ApiTags('Support (Super Admin)')
@ApiBearerAuth()
@RequireSuperAdmin()
@UseGuards(/* SuperAdminGuard */)
@Controller('support')
export class SupportController {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    private readonly tickets: TicketService,
  ) {}

  @Get('tickets')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tüm ticket\'lar (super admin)' })
  async list(@Query() raw: Record<string, string | undefined>): Promise<unknown> {
    const parsed = listQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Geçersiz sorgu.');
    }
    return this.tickets.listTickets(null, parsed.data);
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform destek istatistikleri' })
  async stats(): Promise<unknown> {
    return this.tickets.getStats();
  }

  @Get('tickets/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ticket detayı (herhangi tenant)' })
  async getOne(@Param('id') id: string): Promise<unknown> {
    const ticket = await this.tickets.getTicket(id, null);
    if (!ticket) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ticket bulunamadı.');
    }
    return ticket;
  }

  @Get('tickets/:id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mesajlar (internal dahil)' })
  async getMessages(@Param('id') id: string): Promise<unknown> {
    return this.tickets.getMessages(id, true);
  }

  @Post('tickets/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin cevabı' })
  async reply(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = replySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz mesaj.');
    }
    const ticket = await this.tickets.getTicket(id, null);
    if (!ticket) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ticket bulunamadı.');
    }
    return this.tickets.addMessage({
      ticketId: id,
      authorType: 'super_admin',
      authorId: null,
      authorEmail: 'support@eticart.com.tr',
      authorName: 'Destek Ekibi',
      body: parsed.data.body,
      isInternal: parsed.data.isInternal,
    });
  }

  @Post('tickets/:id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin atama' })
  async assign(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz atama.');
    }
    const result = await this.tickets.assign(
      id,
      parsed.data.adminEmail,
      parsed.data.adminId,
    );
    if (!result) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ticket bulunamadı.');
    }
    return result;
  }

  @Post('tickets/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Status değiştir' })
  async changeStatus(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz status.');
    }
    const result = await this.tickets.updateStatus(id, parsed.data.status);
    if (!result) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ticket bulunamadı.');
    }
    return result;
  }
}
