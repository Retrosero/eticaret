/**
 * B2B Kredi Limiti DTO şemaları.
 */

import { z } from 'zod';

import { uuidSchema } from '@eticart/validation';

/** Kredi limiti tanımlama/güncelleme. */
export const SetCreditLimitSchema = z.object({
  companyAccountId: uuidSchema,
  limitAmount: z.number().positive().max(100_000_000),
  paymentTermDays: z.number().int().positive().max(365),
  autoApproveUnderLimit: z.number().positive().optional(),
});
export type SetCreditLimitInput = z.infer<typeof SetCreditLimitSchema>;

/** Kredi uygunluk kontrolü. */
export const CheckCreditSchema = z.object({
  companyAccountId: uuidSchema,
  requestedAmount: z.number().positive().max(100_000_000),
});
export type CheckCreditInput = z.infer<typeof CheckCreditSchema>;