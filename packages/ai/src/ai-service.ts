/**
 * AI Service — EtiCart AI özellikleri.
 *
 * 6 ana özellik:
 * 1. Ticket Auto-Respond — destek taleplerine otomatik yanıt taslağı
 * 2. Product Description — ürün açıklaması üretici
 * 3. Category Suggestion — kategori tahmini
 * 4. Tag Suggestion — tag önerisi
 * 5. Sentiment Analysis — müşteri duygu analizi
 * 6. Smart Reply — kısa yanıt önerisi (chat için)
 */
import {
  getProvider,
  estimateCost,
  type LlmMessage,
  type LlmModel,
  type LlmProvider,
  type LlmResponse,
} from './llm-provider.js';

// ───────────────────────────────────────────────────────────
// CONFIG
// ───────────────────────────────────────────────────────────

export interface AiServiceConfig {
  provider: LlmProvider;
  model: LlmModel;
  apiKey: string;
  /** Max monthly cost USD (limit aşılırsa red) */
  monthlyBudgetUsd?: number;
  /** Max tokens per request */
  maxTokensPerRequest?: number;
}

export const DEFAULT_AI_CONFIG: Partial<AiServiceConfig> = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  maxTokensPerRequest: 1024,
};

// ───────────────────────────────────────────────────────────
// USAGE TRACKING
// ───────────────────────────────────────────────────────────

export interface AiUsageRecord {
  feature: AiFeature;
  tenantId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  model: string;
  durationMs: number;
  success: boolean;
  error?: string;
  createdAt: string;
}

export type AiFeature =
  | 'ticket.auto_respond'
  | 'product.description'
  | 'product.category_suggest'
  | 'product.tag_suggest'
  | 'sentiment.analyze'
  | 'chat.smart_reply';

export interface AiUsageSummary {
  tenantId: string;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  byFeature: Record<AiFeature, { requests: number; tokens: number; costUsd: number }>;
  monthlyBudgetUsd?: number;
  budgetRemainingUsd?: number;
}

// ───────────────────────────────────────────────────────────
// PROMPTS (Turkish)
// ───────────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  supportAgent: `Sen EtiCart müşteri destek ekibinin yardımcı asistanısın.
Görevin: Müşterinin sorununu anlamak ve nazik, profesyonel, çözüm odaklı bir yanıt taslağı oluşturmak.
Kurallar:
- Yanıtın Türkçe olmalı.
- Nazik ve profesyonel ol.
- Çözüm öner veya bir sonraki adımı söyle.
- Asla kişisel bilgi, kredi kartı veya şifre isteme.
- Bilmediğin bir konuda uydurma, "Ekibimiz sizinle iletişime geçecek" de.
- Kısa ve öz ol (max 3 paragraf).`,

  productCopywriter: `Sen profesyonel bir e-ticaret ürün açıklaması yazarısın.
Görevin: Verilen ürün bilgilerinden, SEO uyumlu, müşteri ikna edici bir Türkçe açıklama üretmek.
Kurallar:
- 150-300 kelime.
- Ürünün özelliklerini vurgula.
- Kullanım senaryoları ekle.
- HTML kullanma, düz metin.
- Yanıt sonunda 5 önerilen etiket (tag) satırı olsun, tire (-) ile başlasın.`,

  categoryClassifier: `Sen bir e-ticaret kategori tahmin uzmanısın.
Görevin: Ürün adı ve açıklamasından en uygun kategoriyi tahmin etmek.
Yanıt SADECE JSON olsun: { "category": "...", "confidence": 0.0-1.0 }
Kategoriler: electronics, fashion, home, beauty, sports, books, toys, food, automotive, other`,

  tagSuggester: `Sen bir e-ticaret ürün etiketleme uzmanısın.
Görevin: Verilen ürün bilgisinden 5-10 SEO uyumlu Türkçe etiket önermek.
Yanıt SADECE JSON olsun: { "tags": ["etiket1", "etiket2", ...] }
Etiketler küçük harf, tire ile ayrılmış olsun.`,

  sentimentAnalyzer: `Sen bir müşteri duygu analizi uzmanısın.
Görevin: Verilen Türkçe metnin duygu durumunu analiz etmek.
Yanıt SADECE JSON olsun:
{
  "sentiment": "positive" | "neutral" | "negative",
  "score": -1.0 ile 1.0 arası,
  "urgency": "low" | "medium" | "high",
  "keywords": ["kelime1", "kelime2"],
  "summary": "Tek cümle özet"
}`,

  smartReply: `Sen bir e-ticaret mağaza sahibi adına kısa müşteri yanıtları üreten yardımcı bir asistansın.
Görevin: Müşteri mesajına 1-2 cümlelik, samimi, profesyonel kısa yanıt üretmek.`,

  ticketCategorizer: `Sen bir destek talebi kategorize uzmanısın.
Görevin: Müşteri talebini analiz edip kategori, öncelik ve etiket önermek.
Yanıt SADECE JSON olsun:
{
  "category": "general" | "billing" | "technical" | "feature_request" | "bug_report" | "integration" | "other",
  "priority": "low" | "normal" | "high" | "urgent",
  "tags": ["tag1", "tag2"],
  "suggestedResponse": "Kısa yanıt taslağı"
}`,
};

// ───────────────────────────────────────────────────────────
// AI SERVICE
// ───────────────────────────────────────────────────────────

export class AiService {
  private config: AiServiceConfig;
  private usageLog: AiUsageRecord[] = [];
  /** Test için: provider inject. */
  private providerOverride?: ReturnType<typeof getProvider>;

  constructor(config: AiServiceConfig, providerOverride?: ReturnType<typeof getProvider>) {
    this.config = config;
    this.providerOverride = providerOverride;
  }

  /** Tenant bazlı monthly kullanım özeti. */
  getMonthlyUsage(tenantId: string): AiUsageSummary {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const records = this.usageLog.filter(
      (r) => r.tenantId === tenantId && new Date(r.createdAt) >= startOfMonth,
    );
    const totalCost = records.reduce((sum, r) => sum + r.costUsd, 0);
    const success = records.filter((r) => r.success).length;

    const byFeature: AiUsageSummary['byFeature'] = {
      'ticket.auto_respond': { requests: 0, tokens: 0, costUsd: 0 },
      'product.description': { requests: 0, tokens: 0, costUsd: 0 },
      'product.category_suggest': { requests: 0, tokens: 0, costUsd: 0 },
      'product.tag_suggest': { requests: 0, tokens: 0, costUsd: 0 },
      'sentiment.analyze': { requests: 0, tokens: 0, costUsd: 0 },
      'chat.smart_reply': { requests: 0, tokens: 0, costUsd: 0 },
    };
    for (const r of records) {
      const f = byFeature[r.feature];
      f.requests++;
      f.tokens += r.totalTokens;
      f.costUsd += r.costUsd;
    }

    return {
      tenantId,
      totalRequests: records.length,
      successRequests: success,
      failedRequests: records.length - success,
      totalTokens: records.reduce((s, r) => s + r.totalTokens, 0),
      totalCostUsd: totalCost,
      byFeature,
      monthlyBudgetUsd: this.config.monthlyBudgetUsd,
      budgetRemainingUsd:
        this.config.monthlyBudgetUsd !== undefined
          ? Math.max(0, this.config.monthlyBudgetUsd - totalCost)
          : undefined,
    };
  }

  /** Budget kontrol. */
  private checkBudget(tenantId: string): { allowed: boolean; reason?: string } {
    if (this.config.monthlyBudgetUsd === undefined) return { allowed: true };
    const usage = this.getMonthlyUsage(tenantId);
    if (usage.totalCostUsd >= this.config.monthlyBudgetUsd) {
      return {
        allowed: false,
        reason: `Monthly budget aşıldı ($${this.config.monthlyBudgetUsd}).`,
      };
    }
    return { allowed: true };
  }

  /** Generic LLM call wrapper. */
  private async callLlm(
    feature: AiFeature,
    tenantId: string,
    messages: LlmMessage[],
    options?: { jsonMode?: boolean; maxTokens?: number; temperature?: number },
  ): Promise<LlmResponse> {
    const budget = this.checkBudget(tenantId);
    if (!budget.allowed) {
      throw new Error(budget.reason ?? 'AI budget exhausted.');
    }

    const provider = this.providerOverride ?? getProvider(this.config.provider);
    const start = Date.now();
    const maxTokens = options?.maxTokens ?? this.config.maxTokensPerRequest ?? 1024;

    let success = true;
    let error: string | undefined;
    let response: LlmResponse;

    try {
      response = await provider.chat(
        {
          messages,
          model: this.config.model,
          jsonMode: options?.jsonMode,
          maxTokens,
          temperature: options?.temperature,
        },
        this.config.apiKey,
      );
    } catch (err) {
      success = false;
      error = (err as Error).message;
      response = {
        content: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: this.config.model,
        finishReason: 'error',
      };
    }

    const durationMs = Date.now() - start;
    const cost = estimateCost(this.config.provider, this.config.model, response.usage);

    this.usageLog.push({
      feature,
      tenantId,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      costUsd: cost,
      model: this.config.model,
      durationMs,
      success,
      error,
      createdAt: new Date().toISOString(),
    });

    if (!success) {
      throw new Error(error ?? 'AI call failed');
    }
    return response;
  }

  // ─────────────────────────────────────────────────────────
  // FEATURES
  // ─────────────────────────────────────────────────────────

  /**
   * 1. Ticket Auto-Respond — destek talebine yanıt taslağı.
   */
  async generateTicketResponse(
    tenantId: string,
    ticket: { subject: string; description: string; category?: string },
  ): Promise<{ response: string; tokens: number; costUsd: number }> {
    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.supportAgent },
      {
        role: 'user',
        content: `Müşteri destek talebi:

Konu: ${ticket.subject}
Kategori: ${ticket.category ?? 'belirtilmemiş'}
Açıklama: ${ticket.description}

Lütfen bu talebe profesyonel bir yanıt taslağı oluştur.`,
      },
    ];
    const r = await this.callLlm('ticket.auto_respond', tenantId, messages);
    return {
      response: r.content,
      tokens: r.usage.totalTokens,
      costUsd: estimateCost(this.config.provider, this.config.model, r.usage),
    };
  }

  /**
   * 2. Product Description — ürün açıklaması üretici.
   */
  async generateProductDescription(
    tenantId: string,
    product: { name: string; category?: string; brand?: string; features?: string[] },
  ): Promise<{ description: string; tags: string[] }> {
    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.productCopywriter },
      {
        role: 'user',
        content: `Ürün bilgileri:
Ad: ${product.name}
Kategori: ${product.category ?? 'belirtilmemiş'}
Marka: ${product.brand ?? 'belirtilmemiş'}
Özellikler: ${(product.features ?? []).join(', ') || 'yok'}

Açıklama ve etiketler üret.`,
      },
    ];
    const r = await this.callLlm('product.description', tenantId, messages, {
      maxTokens: 600,
    });

    // Etiketleri ayır
    const tagLines = r.content.split('\n').filter((l) => l.trim().startsWith('-'));
    const tags = tagLines.map((l) => l.replace(/^-\s*/, '').trim()).slice(0, 5);
    const description = r.content.split('\n').filter((l) => !l.trim().startsWith('-')).join('\n').trim();

    return { description, tags };
  }

  /**
   * 3. Category Suggestion — kategori tahmini.
   */
  async suggestCategory(
    tenantId: string,
    product: { name: string; description?: string },
  ): Promise<{ category: string; confidence: number }> {
    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.categoryClassifier },
      {
        role: 'user',
        content: `Ürün: ${product.name}
Açıklama: ${product.description ?? 'yok'}`,
      },
    ];
    const r = await this.callLlm('product.category_suggest', tenantId, messages, {
      jsonMode: true,
      maxTokens: 100,
      temperature: 0.1,
    });
    try {
      const parsed = JSON.parse(r.content) as { category: string; confidence: number };
      return parsed;
    } catch {
      return { category: 'other', confidence: 0 };
    }
  }

  /**
   * 4. Tag Suggestion — SEO uyumlu etiket önerisi.
   */
  async suggestTags(
    tenantId: string,
    product: { name: string; description?: string; category?: string },
  ): Promise<{ tags: string[] }> {
    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.tagSuggester },
      {
        role: 'user',
        content: `Ürün: ${product.name}
Kategori: ${product.category ?? 'yok'}
Açıklama: ${product.description ?? 'yok'}`,
      },
    ];
    const r = await this.callLlm('product.tag_suggest', tenantId, messages, {
      jsonMode: true,
      maxTokens: 200,
      temperature: 0.3,
    });
    try {
      const parsed = JSON.parse(r.content) as { tags: string[] };
      return parsed;
    } catch {
      return { tags: [] };
    }
  }

  /**
   * 5. Sentiment Analysis — müşteri duygu analizi.
   */
  async analyzeSentiment(
    tenantId: string,
    text: string,
  ): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    score: number;
    urgency: 'low' | 'medium' | 'high';
    keywords: string[];
    summary: string;
  }> {
    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.sentimentAnalyzer },
      { role: 'user', content: `Müşteri mesajı: """${text}"""` },
    ];
    const r = await this.callLlm('sentiment.analyze', tenantId, messages, {
      jsonMode: true,
      maxTokens: 200,
      temperature: 0.1,
    });
    try {
      return JSON.parse(r.content);
    } catch {
      return {
        sentiment: 'neutral',
        score: 0,
        urgency: 'low',
        keywords: [],
        summary: text.slice(0, 80),
      };
    }
  }

  /**
   * 6. Smart Reply — kısa yanıt önerisi.
   */
  async generateSmartReply(
    tenantId: string,
    context: { customerName?: string; lastMessage: string; productName?: string },
  ): Promise<{ reply: string }> {
    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.smartReply },
      {
        role: 'user',
        content: `Müşteri: ${context.customerName ?? 'Müşteri'}
${context.productName ? `Ürün: ${context.productName}` : ''}
Mesaj: ${context.lastMessage}

Kısa yanıt üret.`,
      },
    ];
    const r = await this.callLlm('chat.smart_reply', tenantId, messages, {
      maxTokens: 200,
      temperature: 0.7,
    });
    return { reply: r.content.trim() };
  }

  /**
   * Bonus: Ticket Categorization — kategori + öncelik tahmini.
   */
  async categorizeTicket(
    tenantId: string,
    ticket: { subject: string; description: string },
  ): Promise<{
    category: string;
    priority: string;
    tags: string[];
    suggestedResponse: string;
  }> {
    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.ticketCategorizer },
      {
        role: 'user',
        content: `Konu: ${ticket.subject}
Açıklama: ${ticket.description}`,
      },
    ];
    const r = await this.callLlm('ticket.auto_respond', tenantId, messages, {
      jsonMode: true,
      maxTokens: 500,
      temperature: 0.2,
    });
    try {
      return JSON.parse(r.content);
    } catch {
      return {
        category: 'general',
        priority: 'normal',
        tags: [],
        suggestedResponse: '',
      };
    }
  }
}