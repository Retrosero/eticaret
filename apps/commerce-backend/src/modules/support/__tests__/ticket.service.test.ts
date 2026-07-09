/**
 * Ticket Service — unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@eticart/config';
import { TicketService } from '../ticket.service.js';

const mockPool: any = {
  query: vi.fn(),
};
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};
const mockEmailQueue: any = {
  enqueue: vi.fn().mockResolvedValue(undefined),
};

const sampleTicket = {
  tenantId: 't-1',
  subject: 'Test ticket konusu',
  description: 'Bu bir test destek talebidir. Yeterince uzun açıklama.',
  category: 'general' as const,
  priority: 'normal' as const,
  customerEmail: 'test@example.com',
  customerName: 'Test User',
};

describe('TicketService', () => {
  let service: TicketService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockReset();
    service = new TicketService(mockLogger, mockPool, mockEmailQueue);
  });

  describe('createTicket()', () => {
    it('başarılı oluşturma', async () => {
      // INSERT
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'ticket-1', created_at: new Date() }],
      });
      // addMessage INSERT
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'msg-1', created_at: new Date() }],
      });
      // updated_at UPDATE
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      // getTicket SELECT
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ticket-1',
            tenant_id: 't-1',
            subject: sampleTicket.subject,
            description: sampleTicket.description,
            status: 'open',
            priority: 'normal',
            category: 'general',
            customer_email: sampleTicket.customerEmail,
            customer_name: sampleTicket.customerName,
            assigned_to: null,
            assigned_to_email: null,
            tags: [],
            metadata: {},
            created_at: new Date(),
            updated_at: new Date(),
            resolved_at: null,
            closed_at: null,
          },
        ],
      });

      const result = await service.createTicket(sampleTicket);
      expect(result.id).toBe('ticket-1');
      expect(result.status).toBe('open');
      expect(mockEmailQueue.enqueue).toHaveBeenCalled();
    });

    it('çok kısa konu → 422', async () => {
      await expect(
        service.createTicket({ ...sampleTicket, subject: 'ab' }),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('çok kısa açıklama → 422', async () => {
      await expect(
        service.createTicket({ ...sampleTicket, description: 'kısa' }),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('email queue hatası ticket oluşturmayı engellemez', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'ticket-1', created_at: new Date() }],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'msg-1', created_at: new Date() }],
      });
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ticket-1',
            tenant_id: 't-1',
            subject: sampleTicket.subject,
            description: sampleTicket.description,
            status: 'open',
            priority: 'normal',
            category: 'general',
            customer_email: sampleTicket.customerEmail,
            customer_name: sampleTicket.customerName,
            assigned_to: null,
            assigned_to_email: null,
            tags: [],
            metadata: {},
            created_at: new Date(),
            updated_at: new Date(),
            resolved_at: null,
            closed_at: null,
          },
        ],
      });
      mockEmailQueue.enqueue.mockRejectedValue(new Error('SMTP error'));

      const result = await service.createTicket(sampleTicket);
      expect(result.id).toBe('ticket-1');
    });
  });

  describe('listTickets()', () => {
    it('tenant-scoped filtreleme', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await service.listTickets('t-1', { status: 'open' });
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('tenant_id = $1');
      expect(firstCall[0]).toContain('status = $2');
    });

    it('null tenantId = super admin (tüm tenantlar)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await service.listTickets(null, {});
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).not.toContain('tenant_id');
    });

    it('priority sıralaması (urgent önce)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await service.listTickets('t-1', {});
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('CASE t.priority');
    });
  });

  describe('getTicket()', () => {
    it('mevcut ticket', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ticket-1',
            tenant_id: 't-1',
            subject: 'X',
            description: 'Y',
            status: 'open',
            priority: 'high',
            category: 'bug_report',
            customer_email: 'a@b.com',
            customer_name: 'A',
            assigned_to: null,
            assigned_to_email: null,
            tags: ['urgent'],
            metadata: {},
            created_at: new Date(),
            updated_at: new Date(),
            resolved_at: null,
            closed_at: null,
          },
        ],
      });
      const ticket = await service.getTicket('ticket-1', 't-1');
      expect(ticket?.id).toBe('ticket-1');
      expect(ticket?.priority).toBe('high');
      expect(ticket?.category).toBe('bug_report');
    });

    it('olmayan ticket → null', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const ticket = await service.getTicket('nonexistent');
      expect(ticket).toBeNull();
    });
  });

  describe('addMessage()', () => {
    it('müşteri mesajı', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'msg-1', created_at: new Date() }],
      });
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.addMessage({
        ticketId: 'ticket-1',
        authorType: 'customer',
        authorId: null,
        authorEmail: 'a@b.com',
        authorName: 'A',
        body: 'Yeni mesaj',
      });
      expect(result.authorType).toBe('customer');
      expect(result.body).toBe('Yeni mesaj');
    });

    it('admin mesajı → status in_progress', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'msg-1', created_at: new Date() }],
      });
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      // status update
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.addMessage({
        ticketId: 'ticket-1',
        authorType: 'super_admin',
        authorId: null,
        authorEmail: 'admin@eticart.com.tr',
        authorName: 'Admin',
        body: 'Yanıt',
      });
      const statusCall = mockPool.query.mock.calls[2];
      expect(statusCall[0]).toContain("status = CASE WHEN status = 'open'");
    });

    it('boş mesaj → 422', async () => {
      await expect(
        service.addMessage({
          ticketId: 'ticket-1',
          authorType: 'customer',
          authorId: null,
          authorEmail: 'a@b.com',
          authorName: 'A',
          body: '',
        }),
      ).rejects.toMatchObject({ statusCode: 422 });
    });
  });

  describe('updateStatus()', () => {
    it('resolved → resolved_at set', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ticket-1',
            tenant_id: 't-1',
            subject: 'X',
            description: 'Y',
            status: 'resolved',
            priority: 'normal',
            category: 'general',
            customer_email: 'a@b.com',
            customer_name: 'A',
            assigned_to: null,
            assigned_to_email: null,
            tags: [],
            metadata: {},
            created_at: new Date(),
            updated_at: new Date(),
            resolved_at: new Date(),
            closed_at: null,
          },
        ],
      });
      const result = await service.updateStatus('ticket-1', 'resolved');
      expect(result?.status).toBe('resolved');
      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain("resolved_at = CASE WHEN $2 = 'resolved'");
    });
  });

  describe('assign()', () => {
    it('atama → status assigned', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ticket-1',
            tenant_id: 't-1',
            subject: 'X',
            description: 'Y',
            status: 'assigned',
            priority: 'normal',
            category: 'general',
            customer_email: 'a@b.com',
            customer_name: 'A',
            assigned_to: 'admin-1',
            assigned_to_email: 'admin@eticart.com.tr',
            tags: [],
            metadata: {},
            created_at: new Date(),
            updated_at: new Date(),
            resolved_at: null,
            closed_at: null,
          },
        ],
      });
      const result = await service.assign('ticket-1', 'admin@eticart.com.tr', 'admin-1');
      expect(result?.assignedTo).toBe('admin-1');
    });
  });

  describe('getStats()', () => {
    it('istatistikler', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { status: 'open', count: '5' },
          { status: 'in_progress', count: '3' },
          { status: 'resolved', count: '12' },
        ],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ avg_minutes: '45.5' }],
      });
      const stats = await service.getStats('t-1');
      expect(stats.open).toBe(5);
      expect(stats.inProgress).toBe(3);
      expect(stats.resolved).toBe(12);
      expect(stats.avgFirstResponseMinutes).toBe(45.5);
    });
  });
});
