/**
 * Ürün şemaları — Faz 4'te genişletilecek.
 */

import { z } from 'zod';
import { moneySchema } from '../common.js';

export const productVariantSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  price: moneySchema,
  stockQty: z.coerce.number().int().nonnegative(),
});

export const productCreateSchema = z.object({
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(300),
  description: z.string().max(20_000),
  variants: z.array(productVariantSchema).min(1),
});

export type ProductVariantInput = z.infer<typeof productVariantSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
