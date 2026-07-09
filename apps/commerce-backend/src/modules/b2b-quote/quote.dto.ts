/**
 * B2B Teklif (Quote) DTO şemaları — Zod tabanlı.
 *
 * Şema notu: QuoteStatus Prisma enum'ı küçük harfli (draft, sent, accepted,
 * rejected, expired, converted).
 */

import { z } from 'zod';

import { uuidSchema } from '@eticart/validation';

/** Yeni teklif taslağı. */
export const CreateQuoteSchema = z.object({
  companyAccountId: uuidSchema,
  title: z.string().min(2).max(255).optional(),
  customerCompanyName: z.string().min(2).max(255).optional(),
  customerContactName: z.string().min(2).max(255).optional(),
  customerContactEmail: z.string().email().optional(),
  customerContactPhone: z.string().min(7).max(32).optional(),
  salesRepId: uuidSchema.optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;

/** Teklif kalemi ekleme. */
export const AddQuoteItemSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.optional(),
  sku: z.string().min(1).max(64).optional(),
  skuSnapshot: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(255).optional(),
  productTitle: z.string().min(1).max(255).optional(),
  quantity: z.number().int().positive().max(99_999),
  unitPrice: z.number().positive().max(1_000_000),
  discountPercent: z.number().min(0).max(100).optional(),
  notes: z.string().max(500).optional(),
});
export type AddQuoteItemInput = z.infer<typeof AddQuoteItemSchema>;

/** Teklif reddi gerekçesi. */
export const RejectQuoteSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type RejectQuoteInput = z.infer<typeof RejectQuoteSchema>;

/** Teklif listeleme sorgusu. */
export const ListQuotesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'])
    .optional(),
});
export type ListQuotesQuery = z.infer<typeof ListQuotesQuerySchema>;