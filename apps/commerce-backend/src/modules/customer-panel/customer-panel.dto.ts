/**
 * Müşteri Paneli DTO şemaları — Zod tabanlı.
 */

import { z } from 'zod';

import { trMobileSchema } from '@eticart/validation';

/** Yeni adres ekleme. */
export const AddAddressSchema = z.object({
  fullName: z.string().min(2).max(255),
  phone: trMobileSchema.optional().or(z.string().min(7).max(32)),
  city: z.string().min(1).max(128),
  district: z.string().max(128).optional(),
  addressLine1: z.string().min(2).max(255),
  addressLine2: z.string().max(255).optional(),
  postalCode: z.string().max(16).optional(),
  country: z.string().min(2).max(2).default('TR'),
  isDefault: z.boolean().optional(),
  kind: z.enum(['SHIPPING', 'BILLING', 'BOTH']).default('BOTH'),
});
export type AddAddressInput = z.infer<typeof AddAddressSchema>;

/** KVKK veri ihraç talebi. */
export const DataExportSchema = z.object({});
export type DataExportInput = z.infer<typeof DataExportSchema>;

/** KVKK hesap silme talebi. */
export const AccountDeletionSchema = z.object({});
export type AccountDeletionInput = z.infer<typeof AccountDeletionSchema>;