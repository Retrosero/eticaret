/**
 * B2B Onay İş Akışı (Approval) DTO şemaları.
 */

import { z } from 'zod';

/** Onay notu (kabul). */
export const ApproveSchema = z.object({
  note: z.string().max(500).optional(),
});
export type ApproveInput = z.infer<typeof ApproveSchema>;

/** Red gerekçesi. */
export const RejectSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type RejectInput = z.infer<typeof RejectSchema>;