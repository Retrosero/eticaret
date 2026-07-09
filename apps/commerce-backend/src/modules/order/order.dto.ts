/**
 * Order (Sipariş) DTO şemaları — Zod tabanlı.
 */

import { z } from 'zod';

/** Sipariş durumları (Prisma enum ile aynı küçük harfli değerler). */
export const OrderStatusSchema = z.enum([
  'pending',
  'awaiting_payment',
  'paid',
  'confirmed',
  'preparing',
  'partially_shipped',
  'shipped',
  'delivered',
  'cancellation_requested',
  'cancelled',
  'return_requested',
  'returned',
  'partially_refunded',
  'refunded',
]);
export type OrderStatusInput = z.infer<typeof OrderStatusSchema>;

/** Sipariş listeleme sorgusu. */
export const ListOrdersQuerySchema = z.object({
  status: z
    .union([OrderStatusSchema, z.array(OrderStatusSchema)])
    .optional(),
  search: z.string().min(1).max(128).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(['createdAt', 'grandTotal', 'orderNumber']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>;

/** Durum geçişi. */
export const TransitionOrderSchema = z.object({
  toStatus: OrderStatusSchema,
  reason: z.string().min(1).max(500).optional(),
});
export type TransitionOrderInput = z.infer<typeof TransitionOrderSchema>;

/** İptal. */
export const CancelOrderSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});
export type CancelOrderInput = z.infer<typeof CancelOrderSchema>;

/** İade başlatma. */
export const StartReturnSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});
export type StartReturnInput = z.infer<typeof StartReturnSchema>;