/**
 * AI Service — unit tests (mock provider).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AiService,
  DEFAULT_AI_CONFIG,
  type AiFeature,
} from '../src/index.js';
import { estimateCost, type LlmProviderImpl } from '../src/llm-provider.js';

const mockProvider: LlmProviderImpl = {
  name: 'openai',
  supportedModels: ['gpt-4o-mini'],
  costPer1kTokens: {
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0, output: 0 },
    'gpt-3.5-turbo': { input: 0, output: 0 },
    'claude-3-haiku-20240307': { input: 0, output: 0 },
    'claude-3-sonnet-20240229': { input: 0, output: 0 },
    'claude-3-opus-20240229': { input: 0, output: 0 },
  },
  chat: vi.fn(),
};

describe('AI Service', () => {
  let service: AiService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider.chat.mockReset();
    mockProvider.chat.mockResolvedValue({
      content: 'Test yanıt',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      model: 'gpt-4o-mini',
      finishReason: 'stop',
    });
    service = new AiService(
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-key',
      },
      mockProvider,
    );
  });

  describe('generateTicketResponse()', () => {
    it('başarılı yanıt üretir', async () => {
      const r = await service.generateTicketResponse('tenant-1', {
        subject: 'Ödeme hatası',
        description: 'Kredi kartım reddedildi.',
      });
      expect(r.response).toBe('Test yanıt');
      expect(r.tokens).toBe(150);
      expect(r.costUsd).toBeGreaterThan(0);
    });

    it('system prompt ile gönderir', async () => {
      await service.generateTicketResponse('tenant-1', {
        subject: 'X',
        description: 'Y',
      });
      const callArgs = mockProvider.chat.mock.calls[0]![0];
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[0].content).toContain('EtiCart');
    });

    it('ticket.auto_respond feature olarak loglanır', async () => {
      await service.generateTicketResponse('tenant-1', { subject: 'x', description: 'y' });
      const usage = service.getMonthlyUsage('tenant-1');
      expect(usage.byFeature['ticket.auto_respond'].requests).toBe(1);
    });
  });

  describe('generateProductDescription()', () => {
    it('açıklama + tag üretir', async () => {
      mockProvider.chat.mockResolvedValueOnce({
        content: 'Bu harika bir üründür.\n\n- moda\n- kalite\n- trendy\n- yaz\n- indirim',
        usage: { promptTokens: 80, completionTokens: 200, totalTokens: 280 },
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      const r = await service.generateProductDescription('tenant-1', {
        name: 'Pamuklu T-Shirt',
        category: 'Giyim',
        features: ['Pamuk', 'Unisex'],
      });
      expect(r.description).toContain('harika');
      expect(r.tags).toContain('moda');
      expect(r.tags.length).toBeLessThanOrEqual(5);
    });

    it('maxTokens 600', async () => {
      await service.generateProductDescription('tenant-1', { name: 'X' });
      const opts = mockProvider.chat.mock.calls[0]![0];
      expect(opts.maxTokens).toBe(600);
    });
  });

  describe('suggestCategory()', () => {
    it('JSON parse eder', async () => {
      mockProvider.chat.mockResolvedValueOnce({
        content: '{"category":"electronics","confidence":0.92}',
        usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      const r = await service.suggestCategory('tenant-1', {
        name: 'iPhone 15',
        description: 'Apple akıllı telefon',
      });
      expect(r.category).toBe('electronics');
      expect(r.confidence).toBeCloseTo(0.92);
    });

    it('JSON parse hatası → fallback', async () => {
      mockProvider.chat.mockResolvedValueOnce({
        content: 'invalid json',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      const r = await service.suggestCategory('tenant-1', { name: 'X' });
      expect(r.category).toBe('other');
      expect(r.confidence).toBe(0);
    });

    it('jsonMode + low temperature', async () => {
      await service.suggestCategory('tenant-1', { name: 'X' });
      const opts = mockProvider.chat.mock.calls[0]![0];
      expect(opts.jsonMode).toBe(true);
      expect(opts.temperature).toBe(0.1);
    });
  });

  describe('suggestTags()', () => {
    it('tags array döner', async () => {
      mockProvider.chat.mockResolvedValueOnce({
        content: '{"tags":["iphone","telefon","apple","akıllı","5g"]}',
        usage: { promptTokens: 60, completionTokens: 30, totalTokens: 90 },
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      const r = await service.suggestTags('tenant-1', { name: 'iPhone' });
      expect(r.tags).toEqual(['iphone', 'telefon', 'apple', 'akıllı', '5g']);
    });
  });

  describe('analyzeSentiment()', () => {
    it('duygu analizi yapar', async () => {
      mockProvider.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          sentiment: 'negative',
          score: -0.7,
          urgency: 'high',
          keywords: ['kargo', 'gecikme'],
          summary: 'Müşteri kargonun gecikmesinden şikayetçi',
        }),
        usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      const r = await service.analyzeSentiment('tenant-1', 'Kargo çok geç geldi!');
      expect(r.sentiment).toBe('negative');
      expect(r.urgency).toBe('high');
    });

    it('parse hatası → neutral fallback', async () => {
      mockProvider.chat.mockResolvedValueOnce({
        content: 'invalid',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      const r = await service.analyzeSentiment('tenant-1', 'test');
      expect(r.sentiment).toBe('neutral');
    });
  });

  describe('generateSmartReply()', () => {
    it('kısa yanıt üretir', async () => {
      mockProvider.chat.mockResolvedValueOnce({
        content: 'Tabii, hemen yardımcı olayım.',
        usage: { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      const r = await service.generateSmartReply('tenant-1', {
        customerName: 'Ahmet',
        lastMessage: 'Yardım eder misiniz?',
      });
      expect(r.reply).toContain('yardımcı');
    });
  });

  describe('categorizeTicket()', () => {
    it('kategorize eder', async () => {
      mockProvider.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          category: 'billing',
          priority: 'high',
          tags: ['ödeme', 'kart'],
          suggestedResponse: 'Ödeme konusunda yardımcı olalım.',
        }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      const r = await service.categorizeTicket('tenant-1', {
        subject: 'Ödeme hatası',
        description: 'Kredi kartım reddedildi',
      });
      expect(r.category).toBe('billing');
      expect(r.priority).toBe('high');
    });
  });

  describe('error handling', () => {
    it('provider hatası fırlatır', async () => {
      mockProvider.chat.mockRejectedValueOnce(new Error('API rate limit'));
      await expect(
        service.generateTicketResponse('tenant-1', { subject: 'x', description: 'y' }),
      ).rejects.toThrow('API rate limit');
    });

    it('hata usage loglanır', async () => {
      mockProvider.chat.mockRejectedValueOnce(new Error('fail'));
      try {
        await service.generateTicketResponse('tenant-1', { subject: 'x', description: 'y' });
      } catch {
        // expected
      }
      const usage = service.getMonthlyUsage('tenant-1');
      expect(usage.failedRequests).toBeGreaterThanOrEqual(1);
    });
  });

  describe('budget control', () => {
    it('budget aşılırsa reddet', async () => {
      const budgeted = new AiService(
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          apiKey: 'test',
          monthlyBudgetUsd: 0.00001, // Çok düşük (0.0001'den az)
        },
        mockProvider,
      );
      // İlk istek başarılı, sonra budget aşılır
      await budgeted.generateTicketResponse('tenant-1', { subject: 'x', description: 'y' });
      // İkinci istek budget aşıldığı için reddedilir
      await expect(
        budgeted.generateTicketResponse('tenant-1', { subject: 'x', description: 'y' }),
      ).rejects.toThrow(/budget/i);
    });

    it('budget yoksa her zaman izin', async () => {
      await service.generateTicketResponse('tenant-1', { subject: 'x', description: 'y' });
      await service.generateTicketResponse('tenant-1', { subject: 'x', description: 'y' });
      const usage = service.getMonthlyUsage('tenant-1');
      expect(usage.totalRequests).toBe(2);
    });
  });

  describe('usage tracking', () => {
    it('toplam token + cost doğru hesaplanır', async () => {
      await service.generateTicketResponse('tenant-1', { subject: 'x', description: 'y' });
      await service.suggestTags('tenant-1', { name: 'p' });
      const usage = service.getMonthlyUsage('tenant-1');
      expect(usage.totalTokens).toBe(300); // 150 + 150
      expect(usage.successRequests).toBe(2);
    });

    it('feature bazlı breakdown', async () => {
      await service.generateTicketResponse('tenant-1', { subject: 'x', description: 'y' });
      await service.generateTicketResponse('tenant-1', { subject: 'a', description: 'b' });
      const usage = service.getMonthlyUsage('tenant-1');
      expect(usage.byFeature['ticket.auto_respond'].requests).toBe(2);
    });

    it('tenant izolasyonu', async () => {
      await service.generateTicketResponse('tenant-1', { subject: 'x', description: 'y' });
      await service.generateTicketResponse('tenant-2', { subject: 'x', description: 'y' });
      const u1 = service.getMonthlyUsage('tenant-1');
      const u2 = service.getMonthlyUsage('tenant-2');
      expect(u1.totalRequests).toBe(1);
      expect(u2.totalRequests).toBe(1);
    });
  });
});

describe('estimateCost()', () => {
  it('gpt-4o-mini maliyet hesabı', () => {
    const cost = estimateCost('openai', 'gpt-4o-mini', {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });
    // 1000/1000 * 0.00015 + 500/1000 * 0.0006 = 0.00015 + 0.0003 = 0.00045
    expect(cost).toBeCloseTo(0.00045, 5);
  });

  it('claude haiku maliyet', () => {
    const cost = estimateCost('anthropic', 'claude-3-haiku-20240307', {
      promptTokens: 2000,
      completionTokens: 1000,
      totalTokens: 3000,
    });
    expect(cost).toBeGreaterThan(0);
  });
});