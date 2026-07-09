/**
 * Super admin auth endpoint'leri için Zod şemaları.
 *
 * - Login: email + şifre
 * - Refresh: refresh token
 * - Forgot/Reset: email + (sonra) yeni şifre
 * - 2FA enable/verify: TOTP kodu
 */

import { z } from 'zod';
import { emailSchema, passwordPolicySchema } from '@eticart/validation';

export const superAdminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  /** Opsiyonel 2FA kodu — 2FA aktifse zorunlu. */
  twoFactorCode: z.string().regex(/^\d{6}$/).optional(),
});

export const superAdminRefreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const superAdminForgotPasswordSchema = z.object({
  email: emailSchema,
});

export const superAdminResetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: passwordPolicySchema,
});

export const superAdminTwoFactorSetupSchema = z.object({
  /** Boş gövde; sadece secret ve QR döner. */
});

export const superAdminTwoFactorVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  /** Yedek kod da kabul edilir (recovery senaryosu). */
  backupCode: z
    .string()
    .regex(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2}$/)
    .optional(),
});

export type SuperAdminLoginInput = z.infer<typeof superAdminLoginSchema>;
export type SuperAdminRefreshInput = z.infer<typeof superAdminRefreshSchema>;
export type SuperAdminForgotPasswordInput = z.infer<typeof superAdminForgotPasswordSchema>;
export type SuperAdminResetPasswordInput = z.infer<typeof superAdminResetPasswordSchema>;
export type SuperAdminTwoFactorVerifyInput = z.infer<typeof superAdminTwoFactorVerifySchema>;