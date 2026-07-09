/**
 * AI Backend Service — unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@eticart/config';

const mockAiService = {
  generateTicketResponse: vi.fn(),
  generateProductDescription: vi.fn(),
  suggestTags: vi.fn(),
  analyzeSentiment: vi.fn(),
  categorizeTicket: vi.fn(),
  getMonthlyUsage: vi.fn(),
};

vi.mock('@eticart/ai', () => ({
  AiService: vi.fn().mockImplementation(() => mockAiService),
  preFlight: vi.fn((text: string) => ({ safe: true, sanitizedInput: text, warnings: [] })),
  validateOutput: vi.fn((text: string) => ({ valid: true, cleanedOutput: text })),
}));

const { AiBackendService } = await import('../ai.service.js');

const mockPool: any = { query: vi.fn() };
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('AiBackendService', () => {
  let service: InstanceType<typeof AiBackendService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockReset();
    process.env['OPENAI_API_KEY'] = 'test-key';
    service = new AiBackendService(mockLogger, mockPool);
  });

  describe('generateTicketReply()', () => {
    it('başarılı yanıt üretir', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ subject: 'Test', description: 'Açıklama', category: 'technical' }],
        }) // ticket fetch
        .mockResolvedValueOnce({}); // UPDATE
      mockAiService.generateTicketResponse.mockResolvedValueOnce({
        response: 'Yanıt taslağı',
        tokens: 100,
        costUsd: 0.001,
      });

      const r = await service.generateTicketReply('tenant-1', 'ticket-1');
      expect(r.reply).toBe('Yanıt taslağı');
      expect(r.sanitizedInput).toBe(false);
    });

    it('ticket bulunamadı → 404', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.generateTicketReply('tenant-1', 'ticket-x'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('output validation başarısız → 422', async () => {
      const { validateOutput } = await import('@eticart/ai');
      (validateOutput as any).mockReturnValueOnce({
        valid: false,
        reason: 'toxic içerik',
        cleanedOutput: '',
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ subject: 'X', description: 'Y', category: 'general' }],
      });
      mockAiService.generateTicketResponse.mockResolvedValueOnce({
        response: 'toxic yanıt',
        tokens: 50,
        costUsd: 0.0005,
      });
      await expect(
        service.generateTicketReply('tenant-1', 'ticket-1'),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('preFlight unsafe → 422', async () => {
      const { preFlight } = await import('@eticart/ai');
      (preFlight as any).mockReturnValueOnce({
        safe: false,
        sanitizedInput: '',
        warnings: ['toxic'],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ subject: 'X', description: 'Y', category: 'general' }],
      });
      await expect(
        service.generateTicketReply('tenant-1', 'ticket-1'),
      ).rejects.toMatchObject({ statusCode: 422 });
    });
  });

  describe('approveAiReply()', () => {
    it('taslağı mesaj olarak ekler + status günceller', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ai_draft_response: 'AI yanıtı' }] }) // fetch
        .mockResolvedValueOnce({ rows: [{ id: 'msg-1' }] }) // INSERT message
        .mockResolvedValueOnce({}); // UPDATE ticket
      const r = await service.approveAiReply('tenant-1', 'ticket-1', 'user-1');
      expect(r.messageId).toBe('msg-1');
    });

    it('taslak yok → 404', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ai_draft_response: null }] });
      await expect(
        service.approveAiReply('tenant-1', 'ticket-1', 'user-1'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('ticket bulunamadı → 404', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.approveAiReply('tenant-1', 'ticket-x', 'user-1'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('categorizeTicket()', () => {
    it('kategorize + priority + tags döner', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ subject: 'X', description: 'Y' }] })
        .mockResolvedValueOnce({});
      mockAiService.categorizeTicket.mockResolvedValueOnce({
        category: 'billing',
        priority: 'high',
        tags: ['ödeme'],
        suggestedResponse: 'Yanıt',
      });
      const r = await service.categorizeTicket('tenant-1', 'ticket-1');
      expect(r.category).toBe('billing');
      expect(r.priority).toBe('high');
    });
  });

  describe('generateProductDescription()', () => {
    it('açıklama + tags üretir', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ name: 'T-Shirt', description: null, brand: 'X', features: ['Pamuk'] }] })
        .mockResolvedValueOnce({});
      mockAiService.generateProductDescription.mockResolvedValueOnce({
        description: 'Yumuşak pamuklu t-shirt.',
        tags: ['tshirt', 'pamuk', 'moda'],
      });
      const r = await service.generateProductDescription('tenant-1', 'product-1');
      expect(r.description).toContain('pamuklu');
      expect(r.tags).toContain('tshirt');
    });

    it('ürün bulunamadı → 404', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.generateProductDescription('tenant-1', 'product-x'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('suggestProductTags()', () => {
    it('tag önerisi döner', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ name: 'X', description: 'Y' }] });
      mockAiService.suggestTags.mockResolvedValueOnce({ tags: ['a', 'b', 'c'] });
      const r = await service.suggestProductTags('tenant-1', 'product-1');
      expect(r.tags).toHaveLength(3);
    });
  });

  describe('analyzeSentiment()', () => {
    it('sentiment analizi yapar', async () => {
      mockAiService.analyzeSentiment.mockResolvedValueOnce({
        sentiment: 'negative',
        score: -0.8,
        urgency: 'high',
        keywords: ['kargo', 'gecikme'],
        summary: 'Müşteri kargodan şikayetçi',
      });
      const r = await service.analyzeSentiment('tenant-1', 'Kargo çok geç!');
      expect(r.sentiment).toBe('negative');
    });

    it('unsafe input → 422', async () => {
      const { preFlight } = await import('@eticart/ai');
      (preFlight as any).mockReturnValueOnce({
        safe: false,
        sanitizedInput: '',
        warnings: ['toxic'],
      });
      await expect(
        service.analyzeSentiment('tenant-1', 'toxic içerik'),
      ).rejects.toMatchObject({ statusCode: 422 });
    });
  });

  describe('getUsage()', () => {
    it('tenant kullanım özeti', () => {
      mockAiService.getMonthlyUsage.mockReturnValueOnce({
        totalRequests: 10,
        totalCostUsd: 0.05,
      });
      const r = service.getUsage('tenant-1');
      expect(r).toEqual({
        totalRequests: 10,
        totalCostUsd: 0.05,
      });
    });
  });
});