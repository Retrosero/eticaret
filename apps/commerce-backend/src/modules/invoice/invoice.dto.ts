/**
 * Fatura (Invoice) DTO şemaları — Zod tabanlı.
 */

import { z } from 'zod';

import { uuidSchema } from '@eticart/validation';

/** Fatura tipi. */
export const InvoiceTypeSchema = z.enum(['pdf', 'e_fatura', 'e_arsiv', 'e_irsaliye']);
export type InvoiceTypeInput = z.infer<typeof InvoiceTypeSchema>;

/** Fatura durumu. */
export const InvoiceStatusSchema = z.enum([
  'draft',
  'issued',
  'cancelled',
  'paid',
  'overdue',
]);
export type InvoiceStatusInput = z.infer<typeof InvoiceStatusSchema>;

/** Yeni fatura oluşturma. */
export const CreateInvoiceSchema = z.object({
  orderId: uuidSchema,
  type: InvoiceTypeSchema,
  customerTaxId: z.string().min(10).max(11).optional(),
  customerTaxOffice: z.string().min(1).max(128).optional(),
  customerCompanyName: z.string().min(1).max(255).optional(),
  notes: z.string().max(500).optional(),
});
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

/** Fatura iptali. */
export const CancelInvoiceSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CancelInvoiceInput = z.infer<typeof CancelInvoiceSchema>;

/** Sayfalama. */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationInput = z.infer<typeof PaginationSchema>;