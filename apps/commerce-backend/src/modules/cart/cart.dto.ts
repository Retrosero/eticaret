/**
 * Sepet (Cart) DTO şemaları — Zod tabanlı.
 *
 * Tüm şemalar `class-validator` yerine saf Zod kullanır; NestJS tarafında
 * `ZodValidationPipe` ile çalışır.
 */

import { z } from 'zod';

import { uuidSchema } from '@eticart/validation';

/** Sepet kalemi eklemek için istek gövdesi. */
export const AddToCartSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.optional(),
  quantity: z.number().int().positive().max(999),
  unitPrice: z.number().positive().max(1_000_000),
  name: z.string().min(1).max(255),
  sku: z.string().min(1).max(64).optional(),
  notes: z.string().max(500).optional(),
  kind: z.enum(['PRODUCT', 'SERVICE', 'BUNDLE', 'GIFT_CARD']).optional(),
  variantSnapshot: z.record(z.unknown()).optional(),
});
export type AddToCartInput = z.infer<typeof AddToCartSchema>;

/** Sepet kalemi güncelleme. */
export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().nonnegative().max(999).optional(),
  notes: z.string().max(500).optional(),
});
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemSchema>;

/** Aktif sepet sorgulama (anonim sessionKey veya customerId). */
export const GetOrCreateCartSchema = z.object({
  customerId: uuidSchema.optional(),
  sessionKey: z.string().min(8).max(128).optional(),
});
export type GetOrCreateCartInput = z.infer<typeof GetOrCreateCartSchema>;