/**
 * Checkout DTO şemaları — Zod tabanlı.
 */

import { z } from 'zod';

import { uuidSchema } from '@eticart/validation';

/** Ödeme başlatma isteği. */
export const StartCheckoutSchema = z.object({
  cartId: uuidSchema,
  shippingAddressId: uuidSchema,
  billingAddressId: uuidSchema,
  paymentProviderCode: z.string().min(2).max(64),
  shippingProviderCode: z.string().min(2).max(64).optional(),
  currency: z.enum(['TRY', 'USD', 'EUR', 'GBP']).default('TRY'),
  successUrl: z.string().url(),
  failureUrl: z.string().url(),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(7).max(32),
  ipAddress: z.string().min(7).max(64).optional(),
});
export type StartCheckoutInput = z.infer<typeof StartCheckoutSchema>;

/** Webhook isteği gövdesi (provider'a özel; imza doğrulandıktan sonra parse edilir). */
export const WebhookEnvelopeSchema = z.object({
  providerCode: z.string().min(2).max(64),
  rawBody: z.string().min(2),
  signature: z.string().min(8),
});
export type WebhookEnvelopeInput = z.infer<typeof WebhookEnvelopeSchema>;