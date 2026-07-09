/**
 * Tenant şemaları — Faz 2 genişletildi.
 *
 * @module tenant/validation
 */

import { z } from 'zod';
import { uuidSchema, emailSchema, pageInfoSchema } from '../common.js';

// =====================================================================
// Tenant şemaları
// =====================================================================

/** Tenant slug biçimi: küçük harf, rakam, tire; 2-63 karakter. */
export const tenantSlugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'Slug yalnızca küçük harf, rakam ve tire içerebilir; başı ve sonu alfanümerik olmalıdır.',
  );

/** Tenant durumları (genişletilmiş enum). */
export const tenantStatusSchema = z.enum([
  'draft',
  'provisioning',
  'trial',
  'active',
  'suspended',
  'overdue',
  'cancelled',
  'archived',
  'provisioning_failed',
]);

/** Plan kodları. */
export const planCodeSchema = z.enum(['starter', 'growth', 'business', 'enterprise']);

/** Tenant oluşturma isteği şeması. */
export const createTenantSchema = z.object({
  slug: tenantSlugSchema,
  name: z.string().min(2).max(200),
  plan: planCodeSchema.default('starter'),
  primaryDomain: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9.-]+$/i, 'Alan adı geçersiz.')
    .optional(),
  ownerEmail: emailSchema.optional(),
  region: z.string().min(2).max(20).optional(),
  locale: z.string().min(2).max(10).default('tr-TR'),
  currency: z.enum(['TRY', 'USD', 'EUR', 'GBP']).default('TRY'),
  trialDays: z.coerce.number().int().min(0).max(180).default(14),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

/** Tenant güncelleme şeması (PATCH). */
export const updateTenantSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  status: tenantStatusSchema.optional(),
  plan: planCodeSchema.optional(),
  primaryDomain: z.string().min(3).max(253).optional(),
  region: z.string().min(2).max(20).optional(),
  locale: z.string().min(2).max(10).optional(),
  currency: z.enum(['TRY', 'USD', 'EUR', 'GBP']).optional(),
  suspendedReason: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Tenant listeleme sorgusu (filtre + sayfalama). */
export const listTenantsSchema = pageInfoSchema.extend({
  status: tenantStatusSchema.optional(),
  plan: planCodeSchema.optional(),
  search: z.string().max(200).optional(),
  includeArchived: z.coerce.boolean().default(false),
});

// =====================================================================
// Domain şemaları
// =====================================================================

/** Tenant domain türü. */
export const domainTypeSchema = z.enum(['subdomain', 'custom']);

/** Domain doğrulama durumu. */
export const domainVerificationStatusSchema = z.enum([
  'pending',
  'verified',
  'failed',
]);

/** Domain doğrulama yöntemi. */
export const domainVerificationMethodSchema = z.enum(['dns_txt', 'dns_cname']);

/** Domain adı: tam host (subdomain dahil). */
export const domainNameSchema = z
  .string()
  .min(3)
  .max(253)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i,
    'Geçerli bir alan adı giriniz (örn: ornek.com, magaza.ornek.com).',
  );

/** Yeni domain ekleme isteği. */
export const addDomainSchema = z.object({
  domain: domainNameSchema,
  type: domainTypeSchema.default('custom'),
  isPrimary: z.coerce.boolean().default(false),
  verificationMethod: domainVerificationMethodSchema.default('dns_txt'),
});

/** Domain doğrulama tetikleme. */
export const verifyDomainSchema = z.object({
  expectedToken: z.string().min(8).max(128),
});

// =====================================================================
// Plan şemaları
// =====================================================================

/** Plan oluşturma / güncelleme. */
export const upsertPlanSchema = z.object({
  code: planCodeSchema,
  name: z.string().min(2).max(120),
  description: z.string().max(2000).default(''),
  monthlyPriceKurus: z.coerce.number().int().nonnegative(),
  yearlyPriceKurus: z.coerce.number().int().nonnegative(),
  currency: z.enum(['TRY', 'USD', 'EUR', 'GBP']).default('TRY'),
  trialDays: z.coerce.number().int().nonnegative().max(180),
  maxUsers: z.coerce.number().int().positive(),
  maxProducts: z.coerce.number().int().positive(),
  maxOrdersPerMonth: z.coerce.number().int().positive(),
  maxStorageBytes: z.coerce.number().int().nonnegative(),
  sortOrder: z.coerce.number().int().nonnegative().default(100),
  isActive: z.coerce.boolean().default(true),
  features: z
    .array(
      z.object({
        featureKey: z.string().min(2).max(64),
        enabled: z.coerce.boolean().default(true),
        limitValue: z.coerce.number().int().nonnegative().optional(),
      }),
    )
    .default([]),
});

// =====================================================================
// Subscription şemaları
// =====================================================================

/** Yeni abonelik oluşturma. */
export const createSubscriptionSchema = z.object({
  tenantId: uuidSchema,
  planCode: planCodeSchema,
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  trialDays: z.coerce.number().int().nonnegative().max(180).optional(),
});

/** Abonelik iptali. */
export const cancelSubscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
  atPeriodEnd: z.coerce.boolean().default(true),
});

// =====================================================================
// Feature şemaları
// =====================================================================

/** Tenant özellik override. */
export const upsertTenantFeatureSchema = z.object({
  featureKey: z.string().min(2).max(64),
  enabled: z.coerce.boolean().default(true),
  limitValue: z.coerce.number().int().nonnegative().optional(),
  expiresAt: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/))
    .optional(),
  source: z.enum(['plan', 'manual', 'trial', 'promotion']).default('manual'),
});

// =====================================================================
// License şemaları
// =====================================================================

/** Lisans anahtarı formatı: XXXX-XXXX-XXXX-XXXX. */
export const licenseKeySchema = z
  .string()
  .regex(
    /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
    'Lisans anahtarı XXXX-XXXX-XXXX-XXXX formatında olmalıdır.',
  );

/** Yeni lisans oluşturma. */
export const createLicenseSchema = z.object({
  tenantId: uuidSchema,
  productCode: z.string().min(2).max(64).default('eticart-platform'),
  expiresAt: z.string().datetime().optional(),
  maxActivations: z.coerce.number().int().positive().max(1000).default(1),
  notes: z.string().max(2000).optional(),
  /** Opsiyonel: belirtilirse bu anahtarla üretilir; aksi halde otomatik üretilir. */
  licenseKey: licenseKeySchema.optional(),
});

/** Lisans aktivasyonu. */
export const activateLicenseSchema = z.object({
  licenseKey: licenseKeySchema,
  instanceId: z.string().min(2).max(200),
  instanceHost: z.string().max(253).optional(),
});

// =====================================================================
// Provision şemaları
// =====================================================================

/** Tenant provision işlemi tetikleme. */
export const provisionTenantSchema = z.object({
  tenantId: uuidSchema.optional(),
  /** idempotency-key başlık olarak da gönderilebilir; gövdede de kabul edilir. */
  idempotencyKey: z.string().min(8).max(128).optional(),
  maxAttempts: z.coerce.number().int().positive().max(10).default(3),
});

// =====================================================================
// Genel yardımcı tipler
// =====================================================================

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type ListTenantsInput = z.infer<typeof listTenantsSchema>;
export type AddDomainInput = z.infer<typeof addDomainSchema>;
export type VerifyDomainInput = z.infer<typeof verifyDomainSchema>;
export type UpsertPlanInput = z.infer<typeof upsertPlanSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
export type UpsertTenantFeatureInput = z.infer<typeof upsertTenantFeatureSchema>;
export type CreateLicenseInput = z.infer<typeof createLicenseSchema>;
export type ActivateLicenseInput = z.infer<typeof activateLicenseSchema>;
export type ProvisionTenantInput = z.infer<typeof provisionTenantSchema>;