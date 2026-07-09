/**
 * Tüm modüllerde kullanılan ortak şema parçaları.
 */

import { z } from 'zod';

/** Türkiye telefon numarası (+90XXXXXXXXXX, 11 hane). */
export const trPhoneSchema = z
  .string()
  .regex(
    /^\+90[0-9]{10}$/,
    'Telefon +90XXXXXXXXXX formatında olmalıdır (11 hane).',
  );

/** Türkiye cep telefonu (5XXXXXXXXX). */
export const trMobileSchema = z
  .string()
  .regex(/^5[0-9]{9}$/, 'Cep telefonu 5XXXXXXXXX formatında olmalıdır.');

/** E-posta. */
export const emailSchema = z.string().email('Geçerli bir e-posta adresi giriniz.');

/** TC Kimlik No (11 hane). */
export const tcknSchema = z
  .string()
  .regex(/^[1-9]{1}[0-9]{9}[02468]{1}$/, 'Geçersiz TC Kimlik No.');

/** ISO 4217 para birimi kodu. */
export const currencySchema = z.enum(['TRY', 'USD', 'EUR', 'GBP']);

/** Para değeri şeması (kuruş). */
export const moneySchema = z.object({
  amount: z.coerce.number().int().nonnegative(),
  currency: currencySchema,
});

/** UUID v4. */
export const uuidSchema = z.string().uuid();

/** Sayfa bilgisi. */
export const pageInfoSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
