/**
 * Support Ticket Service.
 *
 * Tenant'lar destek taleplerini (ticket) oluşturabilir, mesajlaşabilir.
 * Super admin tüm ticket'ları görür, atayabilir, çözümleyebilir.
 *
 * Akış:
 *   1. Tenant ticket oluşturur (status: open)
 *   2. Super admin veya auto-assign atar (status: assigned / in_progress)
 *   3. Mesajlar karşılıklı (tenant ↔ admin)
 *   4. Çözüm (status: resolved)
 *   5. Kapatma (status: closed)
 *
 * Email bildirimleri:
 *   - Yeni ticket → super admin
 *   - Yeni mesaj → diğer taraf
 *   - Status değişikliği → tenant
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import type { EmailQueue } from '@eticart/notification-adapters';

import { LOGGER_TOKEN } from '../../common/logger.js';

export type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketCategory =
  | 'general'
  | 'billing'
  | 'technical'
  | 'feature_request'
  | 'bug_report'
  | 'integration'
  | 'other';

export interface Ticket {
  id: string;
  tenantId: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  customerEmail: string;
  customerName: string;
  assignedTo: string | null;
  assignedToEmail: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  messageCount?: number;
  lastMessageAt?: string | null;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorType: 'customer' | 'super_admin' | 'system';
  authorId: string | null;
  authorEmail: string;
  authorName: string;
  body: string;
  attachments: string[];
  isInternal: boolean;
  createdAt: string;
}

@Injectable()
export class TicketService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
    @Inject('EMAIL_QUEUE_TOKEN') private readonly emailQueue: EmailQueue | null = null,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // TICKET CRUD
  // ─────────────────────────────────────────────────────────────

  /**
   * Yeni ticket oluştur.
   */
  async createTicket(input: {
    tenantId: string;
    subject: string;
    description: string;
    category: TicketCategory;
    priority: TicketPriority;
    customerEmail: string;
    customerName: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<Ticket> {
    if (input.subject.length < 5 || input.subject.length > 200) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Konu 5-200 karakter arasında olmalı.',
      );
    }
    if (input.description.length < 10) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Açıklama en az 10 karakter olmalı.',
      );
    }

    const r = await this.pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO public.support_tickets (
         tenant_id, subject, description, status, priority, category,
         customer_email, customer_name, tags, metadata
       ) VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8::text[], $9::jsonb)
       RETURNING id, created_at`,
      [
        input.tenantId,
        input.subject,
        input.description,
        input.priority,
        input.category,
        input.customerEmail,
        input.customerName,
        input.tags ?? [],
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const ticketId = r.rows[0]!.id;

    // İlk mesaj olarak description'ı da ekle
    await this.addMessage({
      ticketId,
      authorType: 'customer',
      authorId: null,
      authorEmail: input.customerEmail,
      authorName: input.customerName,
      body: input.description,
      isInternal: false,
    });

    // Super admin'e email bildirim
    this.emailQueue?.enqueue({
        jobId: `ticket-new-${ticketId}`,
        event: 'support.ticket.created',
        data: {
          to: 'support@eticart.com.tr',
          ticketId,
          subject: input.subject,
          tenantId: input.tenantId,
          customerEmail: input.customerEmail,
          priority: input.priority,
          category: input.category,
        },
        templateName: 'support_ticket_created',
        adapterName: 'smtp',
      })
      .catch((err) =>
        this.logger.error(
          { err: (err as Error).message, ticketId },
          'Ticket email gönderilemedi',
        ),
      );

    this.logger.info(
      { ticketId, tenantId: input.tenantId, subject: input.subject },
      'Yeni destek talebi oluşturuldu',
    );

    return (await this.getTicket(ticketId, input.tenantId))!;
  }

  /**
   * Ticket'ları listele (tenant-scoped).
   */
  async listTickets(
    tenantId: string | null,
    filter: {
      status?: TicketStatus;
      priority?: TicketPriority;
      category?: TicketCategory;
      assignedTo?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ items: Ticket[]; total: number; page: number; limit: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (tenantId) {
      conditions.push(`t.tenant_id = $${i++}`);
      params.push(tenantId);
    }
    if (filter.status) {
      conditions.push(`t.status = $${i++}`);
      params.push(filter.status);
    }
    if (filter.priority) {
      conditions.push(`t.priority = $${i++}`);
      params.push(filter.priority);
    }
    if (filter.category) {
      conditions.push(`t.category = $${i++}`);
      params.push(filter.category);
    }
    if (filter.assignedTo) {
      conditions.push(`t.assigned_to = $${i++}`);
      params.push(filter.assignedTo);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const offset = (page - 1) * limit;

    const items = await this.pool.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM public.support_ticket_messages WHERE ticket_id = t.id)::int as message_count,
              (SELECT MAX(created_at) FROM public.support_ticket_messages WHERE ticket_id = t.id) as last_message_at
       FROM public.support_tickets t
       ${where}
       ORDER BY
         CASE t.priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           WHEN 'low' THEN 4
         END,
         t.updated_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset],
    );
    const total = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM public.support_tickets t ${where}`,
      params,
    );

    return {
      items: items.rows.map((r) => this.mapTicketRow(r)),
      total: Number(total.rows[0]?.count ?? '0'),
      page,
      limit,
    };
  }

  /**
   * Ticket detayı.
   */
  async getTicket(
    ticketId: string,
    tenantId?: string | null,
  ): Promise<Ticket | null> {
    const conditions = ['id = $1'];
    const params: unknown[] = [ticketId];
    if (tenantId) {
      conditions.push(`tenant_id = $2`);
      params.push(tenantId);
    }
    const r = await this.pool.query(
      `SELECT * FROM public.support_tickets WHERE ${conditions.join(' AND ')} LIMIT 1`,
      params,
    );
    if (!r.rows[0]) return null;
    return this.mapTicketRow(r.rows[0]);
  }

  /**
   * Ticket'a mesaj ekle.
   */
  async addMessage(input: {
    ticketId: string;
    authorType: 'customer' | 'super_admin' | 'system';
    authorId: string | null;
    authorEmail: string;
    authorName: string;
    body: string;
    attachments?: string[];
    isInternal?: boolean;
  }): Promise<TicketMessage> {
    if (input.body.length < 1) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Mesaj boş olamaz.',
      );
    }
    const r = await this.pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO public.support_ticket_messages (
         ticket_id, author_type, author_id, author_email, author_name,
         body, attachments, is_internal
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8)
       RETURNING id, created_at`,
      [
        input.ticketId,
        input.authorType,
        input.authorId,
        input.authorEmail,
        input.authorName,
        input.body,
        input.attachments ?? [],
        input.isInternal ?? false,
      ],
    );

    // Ticket updated_at güncelle
    await this.pool.query(
      `UPDATE public.support_tickets SET updated_at = now() WHERE id = $1`,
      [input.ticketId],
    );

    // Eğer admin mesaj yazdıysa ve status open ise, assigned'e çek
    if (input.authorType === 'super_admin') {
      await this.pool.query(
        `UPDATE public.support_tickets
         SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
         WHERE id = $1`,
        [input.ticketId],
      );
    }

    this.logger.info(
      { ticketId: input.ticketId, authorType: input.authorType },
      'Ticket mesaj eklendi',
    );

    return {
      id: r.rows[0]!.id,
      ticketId: input.ticketId,
      authorType: input.authorType,
      authorId: input.authorId,
      authorEmail: input.authorEmail,
      authorName: input.authorName,
      body: input.body,
      attachments: input.attachments ?? [],
      isInternal: input.isInternal ?? false,
      createdAt: r.rows[0]!.created_at.toISOString(),
    };
  }

  /**
   * Ticket mesajlarını getir.
   */
  async getMessages(
    ticketId: string,
    includeInternal = false,
  ): Promise<TicketMessage[]> {
    const where = includeInternal
      ? 'ticket_id = $1'
      : 'ticket_id = $1 AND is_internal = false';
    const r = await this.pool.query(
      `SELECT * FROM public.support_ticket_messages
       WHERE ${where}
       ORDER BY created_at ASC`,
      [ticketId],
    );
    return r.rows.map((row) => ({
      id: row['id'],
      ticketId: row['ticket_id'],
      authorType: row['author_type'],
      authorId: row['author_id'],
      authorEmail: row['author_email'],
      authorName: row['author_name'],
      body: row['body'],
      attachments: row['attachments'] ?? [],
      isInternal: row['is_internal'],
      createdAt: (row['created_at'] as Date).toISOString(),
    }));
  }

  /**
   * Ticket status güncelle.
   */
  async updateStatus(
    ticketId: string,
    status: TicketStatus,
  ): Promise<Ticket | null> {
    const r = await this.pool.query(
      `UPDATE public.support_tickets
       SET status = $2,
           resolved_at = CASE WHEN $2 = 'resolved' AND resolved_at IS NULL THEN now() ELSE resolved_at END,
           closed_at = CASE WHEN $2 = 'closed' AND closed_at IS NULL THEN now() ELSE closed_at END
       WHERE id = $1
       RETURNING *`,
      [ticketId, status],
    );
    if (!r.rows[0]) return null;
    return this.mapTicketRow(r.rows[0]);
  }

  /**
   * Ticket atama.
   */
  async assign(
    ticketId: string,
    adminEmail: string,
    adminId?: string,
  ): Promise<Ticket | null> {
    const r = await this.pool.query(
      `UPDATE public.support_tickets
       SET assigned_to = $2,
           assigned_to_email = $3,
           status = CASE WHEN status = 'open' THEN 'assigned' ELSE status END
       WHERE id = $1
       RETURNING *`,
      [ticketId, adminId ?? adminEmail, adminEmail],
    );
    if (!r.rows[0]) return null;
    return this.mapTicketRow(r.rows[0]);
  }

  /**
   * Ticket istatistikleri.
   */
  async getStats(tenantId?: string): Promise<{
    open: number;
    inProgress: number;
    waitingCustomer: number;
    resolved: number;
    avgFirstResponseMinutes: number;
  }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (tenantId) {
      conditions.push('tenant_id = $1');
      params.push(tenantId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await this.pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count
       FROM public.support_tickets
       ${where}
       GROUP BY status`,
      params,
    );
    const map: Record<string, number> = {};
    for (const row of r.rows) map[row.status] = Number(row.count);

    // Avg first response (first admin message - ticket created)
    const avg = await this.pool.query<{ avg_minutes: string | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (first_admin.created_at - t.created_at)) / 60)::text as avg_minutes
       FROM public.support_tickets t
       INNER JOIN LATERAL (
         SELECT MIN(created_at) as created_at
         FROM public.support_ticket_messages
         WHERE ticket_id = t.id AND author_type = 'super_admin'
         LIMIT 1
       ) first_admin ON true
       ${where}`,
      params,
    );

    return {
      open: map['open'] ?? 0,
      inProgress: map['in_progress'] ?? 0,
      waitingCustomer: map['waiting_customer'] ?? 0,
      resolved: map['resolved'] ?? 0,
      avgFirstResponseMinutes: Number(avg.rows[0]?.avg_minutes ?? 0),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // INTERNAL
  // ─────────────────────────────────────────────────────────────

  private mapTicketRow(row: Record<string, unknown>): Ticket {
    return {
      id: row['id'] as string,
      tenantId: row['tenant_id'] as string,
      subject: row['subject'] as string,
      description: row['description'] as string,
      status: row['status'] as TicketStatus,
      priority: row['priority'] as TicketPriority,
      category: row['category'] as TicketCategory,
      customerEmail: row['customer_email'] as string,
      customerName: row['customer_name'] as string,
      assignedTo: (row['assigned_to'] as string) ?? null,
      assignedToEmail: (row['assigned_to_email'] as string) ?? null,
      tags: (row['tags'] as string[]) ?? [],
      metadata: (row['metadata'] as Record<string, unknown>) ?? {},
      createdAt: (row['created_at'] as Date).toISOString(),
      updatedAt: (row['updated_at'] as Date).toISOString(),
      resolvedAt: row['resolved_at']
        ? (row['resolved_at'] as Date).toISOString()
        : null,
      closedAt: row['closed_at']
        ? (row['closed_at'] as Date).toISOString()
        : null,
      messageCount: row['message_count'] as number | undefined,
      lastMessageAt: row['last_message_at']
        ? (row['last_message_at'] as Date).toISOString()
        : null,
    };
  }
}
