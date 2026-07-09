/**
 * Kimlik doğrulama şemaları — Faz 3'te genişletilecek.
 */

import { z } from 'zod';
import { emailSchema, trMobileSchema } from '../common.js';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
  fullName: z.string().min(2).max(200),
  phone: trMobileSchema.optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
