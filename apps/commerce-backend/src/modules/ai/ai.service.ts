/**
 * AI Backend Service — EtiCart business logic + LLM entegrasyonu.
 *
 * Faz 25: Ticket auto-respond, ürün açıklaması üretici, sentiment analizi.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { AiService, preFlight, validateOutput } from '@eticart/ai';

import { LOGGER_TOKEN } from '../../common/logger.js';

@Injectable()
export class AiBackendService {
  private service: AiService;

  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
  ) {
    // Config from env
    const provider = (process.env['AI_PROVIDER'] ?? 'openai') as 'openai' | 'anthropic';
    const apiKey =
      provider === 'openai'
        ? (process.env['OPENAI_API_KEY'] ?? '')
        : (process.env['ANTHROPIC_API_KEY'] ?? '');
    const model =
      process.env['AI_MODEL'] ??
      (provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-haiku-20240307');
    const monthlyBudget = parseFloat(process.env['AI_MONTHLY_BUDGET_USD'] ?? '50');

    this.service = new AiService({
      provider,
      model: model as never,
      apiKey,
      monthlyBudgetUsd: monthlyBudget,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // TICKET AI
  // ─────────────────────────────────────────────────────────────

  /**
   * Ticket için AI yanıt taslağı üret.
   */
  async generateTicketReply(
    tenantId: string,
    ticketId: string,
    regenerate = false,
  ): Promise<{ reply: string; sanitizedInput: boolean; warnings: string[] }> {
    // Ticket'ı DB'den al
    const r = await this.pool.query(
      `SELECT subject, description, category FROM public.support_tickets
       WHERE id = $1 AND tenant_id = $2`,
      [ticketId, tenantId],
    );
    if (r.rows.length === 0) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ticket bulunamadı.');
    }
    const ticket = r.rows[0] as { subject: string; description: string; category: string };

    // Guardrails: pre-flight
    const flight = preFlight(`${ticket.subject} ${ticket.description}`);
    if (!flight.safe) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        `Input güvenli değil: ${flight.warnings.join('; ')}`,
      );
    }

    // LLM call
    const result = await this.service.generateTicketResponse(tenantId, {
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
    });

    // Output validation
    const validation = validateOutput(result.response);
    if (!validation.valid) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        `AI yanıtı geçersiz: ${validation.reason}`,
      );
    }

    // DB'de taslağı sakla
    await this.pool.query(
      `UPDATE public.support_tickets
       SET ai_draft_response = $2,
           ai_draft_generated_at = now(),
           ai_draft_approved = false
       WHERE id = $1`,
      [ticketId, validation.cleanedOutput],
    );

    return {
      reply: validation.cleanedOutput,
      sanitizedInput: flight.warnings.length > 0,
      warnings: flight.warnings,
    };
  }

  /**
   * AI taslağını onayla ve gerçek yanıt olarak ekle.
   */
  async approveAiReply(
    tenantId: string,
    ticketId: string,
    authorId: string,
  ): Promise<{ messageId: string }> {
    const r = await this.pool.query<{ ai_draft_response: string | null }>(
      `SELECT ai_draft_response FROM public.support_tickets
       WHERE id = $1 AND tenant_id = $2`,
      [ticketId, tenantId],
    );
    if (r.rows.length === 0 || !r.rows[0]?.ai_draft_response) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'AI taslağı bulunamadı.');
    }
    const reply = r.rows[0].ai_draft_response;

    const msgR = await this.pool.query<{ id: string }>(
      `INSERT INTO public.support_ticket_messages (
         ticket_id, author_type, author_id, author_email, author_name, body
       )
       SELECT $1, 'super_admin', $2, 'ai@eticart.com.tr', 'AI Asistan', $3
       RETURNING id`,
      [ticketId, authorId, reply],
    );

    await this.pool.query(
      `UPDATE public.support_tickets
       SET ai_draft_approved = true,
           status = 'in_progress',
           updated_at = now()
       WHERE id = $1`,
      [ticketId],
    );

    return { messageId: msgR.rows[0]?.id ?? '' };
  }

  /**
   * Ticket'ı otomatik kategorize et.
   */
  async categorizeTicket(
    tenantId: string,
    ticketId: string,
  ): Promise<{ category: string; priority: string; tags: string[] }> {
    const r = await this.pool.query(
      `SELECT subject, description FROM public.support_tickets
       WHERE id = $1 AND tenant_id = $2`,
      [ticketId, tenantId],
    );
    if (r.rows.length === 0) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ticket bulunamadı.');
    }
    const ticket = r.rows[0] as { subject: string; description: string };

    const result = await this.service.categorizeTicket(tenantId, ticket);

    await this.pool.query(
      `UPDATE public.support_tickets
       SET category = $2,
           priority = $3,
           metadata = metadata || jsonb_build_object('ai_tags', $4::jsonb)
       WHERE id = $1`,
      [ticketId, result.category, result.priority, JSON.stringify(result.tags)],
    );

    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // PRODUCT AI
  // ─────────────────────────────────────────────────────────────

  /**
   * Ürün açıklaması üret.
   */
  async generateProductDescription(
    tenantId: string,
    productId: string,
  ): Promise<{ description: string; tags: string[]; tokens: number }> {
    const r = await this.pool.query(
      `SELECT name, description, brand, features FROM public.products
       WHERE id = $1 AND tenant_id = $2`,
      [productId, tenantId],
    );
    if (r.rows.length === 0) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ürün bulunamadı.');
    }
    const product = r.rows[0] as {
      name: string;
      description: string | null;
      brand: string | null;
      features: string[] | null;
    };

    const result = await this.service.generateProductDescription(tenantId, {
      name: product.name,
      brand: product.brand ?? undefined,
      features: product.features ?? undefined,
    });

    const validation = validateOutput(result.description);
    if (!validation.valid) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        `AI yanıtı geçersiz: ${validation.reason}`,
      );
    }

    await this.pool.query(
      `UPDATE public.products
       SET description = COALESCE($2, description),
           tags = $3::text[],
           ai_enhanced_at = now()
       WHERE id = $1`,
      [productId, validation.cleanedOutput, result.tags],
    );

    return {
      description: validation.cleanedOutput,
      tags: result.tags,
      tokens: 0,
    };
  }

  /**
   * Ürün için kategori + tag önerisi.
   */
  async suggestProductTags(
    tenantId: string,
    productId: string,
  ): Promise<{ tags: string[] }> {
    const r = await this.pool.query(
      `SELECT name, description FROM public.products
       WHERE id = $1 AND tenant_id = $2`,
      [productId, tenantId],
    );
    if (r.rows.length === 0) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ürün bulunamadı.');
    }
    const product = r.rows[0] as { name: string; description: string | null };

    const result = await this.service.suggestTags(tenantId, product);
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // SENTIMENT
  // ─────────────────────────────────────────────────────────────

  /**
   * Müşteri mesajının duygu analizi.
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
    const flight = preFlight(text);
    if (!flight.safe) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        `Text güvenli değil: ${flight.warnings.join('; ')}`,
      );
    }
    return this.service.analyzeSentiment(tenantId, flight.sanitizedInput);
  }

  // ─────────────────────────────────────────────────────────────
  // USAGE
  // ─────────────────────────────────────────────────────────────

  /**
   * Tenant için AI kullanım özeti.
   */
  getUsage(tenantId: string): unknown {
    return this.service.getMonthlyUsage(tenantId);
  }
}