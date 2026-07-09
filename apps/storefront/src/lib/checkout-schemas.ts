/**
 * Checkout form validasyon şemaları (Zod).
 *
 * Hem yeni adres formu hem ödeme seçimi için tek tip-güvenli şema.
 */

import { z } from 'zod';

/** Türkiye telefon numarası basit doğrulama (5XXXXXXXXX, 10 hane). */
const phoneTrSchema = z
  .string()
  .min(10, 'Telefon en az 10 hane olmalı')
  .max(15, 'Telefon çok uzun')
  .regex(/^[0-9+\s()-]+$/u, 'Geçersiz telefon formatı');

/** TC kimlik no / VKN. 10 veya 11 hane. */
const vknTcknSchema = z
  .string()
  .min(10, 'VKN/TC 10 hane olmalı')
  .max(11, 'VKN/TC en fazla 11 hane olmalı')
  .regex(/^[0-9]+$/u, 'Yalnızca rakam')
  .optional()
  .or(z.literal(''));

/** Adres şeması — hem teslimat hem fatura için. */
export const addressSchema = z.object({
  title: z.string().min(2, 'Adres başlığı zorunlu').max(60),
  fullName: z.string().min(3, 'Ad Soyad zorunlu').max(100),
  phone: phoneTrSchema,
  city: z.string().min(2, 'İl zorunlu').max(40),
  district: z.string().min(2, 'İlçe zorunlu').max(40),
  postalCode: z
    .string()
    .regex(/^[0-9]{5}$/u, 'Posta kodu 5 hane olmalı')
    .or(z.literal(''))
    .optional(),
  addressLine: z.string().min(10, 'Adres zorunlu (en az 10 karakter)').max(250),
  companyName: z.string().max(150).optional().or(z.literal('')),
  taxId: vknTcknSchema,
  taxOffice: z.string().max(60).optional().or(z.literal('')),
});

export type AddressInput = z.infer<typeof addressSchema>;

/** Checkout tam formu (adres + ödeme yöntemi + fatura tipi). */
export const checkoutSchema = z.object({
  shippingAddress: addressSchema,
  billingSameAsShipping: z.boolean().default(true),
  billingAddress: addressSchema.optional(),
  paymentMethod: z.enum(['iyzico', 'bank_transfer', 'cash_on_delivery'], {
    errorMap: () => ({ message: 'Ödeme yöntemi seçilmedi' }),
  }),
  acceptTerms: z
    .boolean()
    .refine((val) => val === true, 'Mesafeli satış sözleşmesini onaylayın'),
  kvkkConsent: z
    .boolean()
    .refine((val) => val === true, 'KVKK aydınlatma metnini onaylayın'),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
