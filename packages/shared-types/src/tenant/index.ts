/**
 * Tenant, domain, abonelik, paket ve lisans ile ilgili tipler.
 * Hem backend hem frontend bu tipleri tüketir.
 *
 * @module tenant
 */

import type { IsoDateString, Uuid } from '../common/index.js';

/**
 * Tenant yaşam döngüsü durumları (Faz 2 — genişletildi).
 *
 *  - draft                : henüz provision başlamadı
 *  - provisioning         : aktif provision işlemi sürüyor
 *  - trial                : deneme süresinde
 *  - active               : canlı
 *  - suspended            : askıda (faturalama ödenmedi vb.)
 *  - overdue              : ödeme gecikmiş
 *  - cancelled            : iptal edildi
 *  - archived             : arşivlendi (soft delete)
 *  - provisioning_failed  : provision başarısız (yeniden denenebilir)
 */
export type TenantStatus =
  | 'draft'
  | 'provisioning'
  | 'trial'
  | 'active'
  | 'suspended'
  | 'overdue'
  | 'cancelled'
  | 'archived'
  | 'provisioning_failed';

/** Faturalama planı kodu. */
export type PlanCode =
  | 'starter'
  | 'growth'
  | 'business'
  | 'enterprise';

/** Tenant ana verisi. */
export interface Tenant {
  id: Uuid;
  slug: string;
  name: string;
  status: TenantStatus;
  plan: PlanCode;
  primaryDomain: string | null;
  trialEndAt: IsoDateString | null;
  suspendedReason: string | null;
  region: string | null;
  locale: string;
  currency: string;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  deletedAt: IsoDateString | null;
  metadata: Record<string, unknown>;
}

/** Tenant oluşturma isteği. */
export interface CreateTenantRequest {
  slug: string;
  name: string;
  plan?: PlanCode;
  primaryDomain?: string;
  ownerEmail?: string;
  region?: string;
  locale?: string;
  currency?: string;
  trialDays?: number;
}

/** Tenant domain türü. */
export type TenantDomainType = 'subdomain' | 'custom';

/** Domain doğrulama durumu. */
export type DomainVerificationStatus = 'pending' | 'verified' | 'failed';

/** Domain doğrulama yöntemi. */
export type DomainVerificationMethod = 'dns_txt' | 'dns_cname';

/** Tenant domain eşlemesi. */
export interface TenantDomain {
  id: Uuid;
  tenantId: Uuid;
  domain: string;
  type: TenantDomainType;
  isPrimary: boolean;
  verificationStatus: DomainVerificationStatus;
  verificationToken: string | null;
  verificationMethod: DomainVerificationMethod | null;
  verifiedAt: IsoDateString | null;
  lastCheckedAt: IsoDateString | null;
  createdAt: IsoDateString;
}

/** Tenant çözümleme sonucu (request context). */
export interface TenantContext {
  tenantId: Uuid;
  tenantSlug: string;
  schemaName: string;
  primaryDomain: string;
  status: TenantStatus;
}

/** Abonelik durumu. */
export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired';

/** Faturalama döngüsü. */
export type BillingCycle = 'monthly' | 'yearly';

/** Abonelik kaydı. */
export interface TenantSubscription {
  id: Uuid;
  tenantId: Uuid;
  planId: Uuid;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  startedAt: IsoDateString;
  currentPeriodStart: IsoDateString;
  currentPeriodEnd: IsoDateString;
  trialEndAt: IsoDateString | null;
  cancelledAt: IsoDateString | null;
  externalSubscriptionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Paket tanımı. */
export interface SubscriptionPlan {
  id: Uuid;
  code: PlanCode;
  name: string;
  description: string;
  monthlyPriceKurus: number;
  yearlyPriceKurus: number;
  currency: string;
  trialDays: number;
  maxUsers: number;
  maxProducts: number;
  maxOrdersPerMonth: number;
  maxStorageBytes: number;
  isActive: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Paket özelliği. */
export interface PlanFeature {
  id: Uuid;
  planId: Uuid;
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  metadata: Record<string, unknown>;
  createdAt: IsoDateString;
}

/** Tenant bazlı özellik override. */
export interface TenantFeature {
  id: Uuid;
  tenantId: Uuid;
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  source: 'plan' | 'manual' | 'trial' | 'promotion';
  expiresAt: IsoDateString | null;
  metadata: Record<string, unknown>;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Tenant kullanım sayaçları. */
export interface TenantUsage {
  tenantId: Uuid;
  usersCount: number;
  productsCount: number;
  ordersCount: number;
  storageBytes: number;
  lastRecalculatedAt: IsoDateString;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Tenant ayarları. */
export interface TenantSettings {
  tenantId: Uuid;
  invoiceSettings: Record<string, unknown>;
  kvkkSettings: Record<string, unknown>;
  emailSettings: Record<string, unknown>;
  shippingSettings: Record<string, unknown>;
  featureOverrides: Record<string, unknown>;
  customSettings: Record<string, unknown>;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Provision iş adımı durumu. */
export interface ProvisionStepResult {
  step: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  startedAt: IsoDateString | null;
  finishedAt: IsoDateString | null;
  error?: string;
}

/** Provision job durumu. */
export type ProvisionJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

/** Tenant provision iş kaydı. */
export interface TenantProvisionJob {
  id: Uuid;
  tenantId: Uuid;
  status: ProvisionJobStatus;
  currentStep: string | null;
  steps: ProvisionStepResult[];
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  startedAt: IsoDateString | null;
  finishedAt: IsoDateString | null;
  nextRetryAt: IsoDateString | null;
  idempotencyKey: string | null;
  triggeredBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Tenant durum değişikliği geçmişi kaydı. */
export interface TenantStatusHistory {
  id: Uuid;
  tenantId: Uuid;
  fromStatus: TenantStatus | null;
  toStatus: TenantStatus;
  reason: string | null;
  actorId: Uuid | null;
  actorType: 'system' | 'super_admin' | 'tenant_owner' | 'api';
  metadata: Record<string, unknown>;
  createdAt: IsoDateString;
}

/** Lisans durumu. */
export type LicenseStatus = 'active' | 'suspended' | 'revoked' | 'expired';

/** Lisans anahtarı kaydı. */
export interface License {
  id: Uuid;
  tenantId: Uuid;
  licenseKeyHash: string;
  licenseKeyLast4: string;
  productCode: string;
  status: LicenseStatus;
  issuedAt: IsoDateString;
  expiresAt: IsoDateString | null;
  maxActivations: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Lisans aktivasyon kaydı. */
export interface LicenseActivation {
  id: Uuid;
  licenseId: Uuid;
  tenantId: Uuid;
  activatedAt: IsoDateString;
  instanceId: string | null;
  instanceHost: string | null;
  userAgent: string | null;
  ipMasked: string | null;
  revokedAt: IsoDateString | null;
  metadata: Record<string, unknown>;
}

/** Audit log kaydı. */
export interface AuditLog {
  id: Uuid;
  occurredAt: IsoDateString;
  actorId: Uuid | null;
  actorEmailMasked: string | null;
  actorType: 'super_admin' | 'tenant_admin' | 'system' | 'api';
  tenantId: Uuid | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipMasked: string | null;
  userAgent: string | null;
  requestId: string | null;
  correlationId: string | null;
  success: boolean;
  metadata: Record<string, unknown>;
}

/** Varsayılan tenant özellik anahtarları. */
export type FeatureKey =
  | 'b2b_enabled'
  | 'multi_warehouse'
  | 'advanced_reports'
  | 'api_access'
  | 'custom_domain'
  | 'loyalty_program'
  | 'wholesale_pricing'
  | 'abandoned_cart_recovery'
  | 'gift_cards'
  | 'subscription_products'
  | 'marketplace_connect'
  | 'pos_module'
  | 'blog_module'
  | 'priority_support';

/** Paket tier eşleme varsayılanı (plan kodu → varsayılan özellik anahtarları). */
export const DEFAULT_PLAN_FEATURES: Readonly<Record<PlanCode, ReadonlyArray<FeatureKey>>> = {
  starter: ['loyalty_program'],
  growth: [
    'loyalty_program',
    'multi_warehouse',
    'advanced_reports',
    'abandoned_cart_recovery',
  ],
  business: [
    'loyalty_program',
    'multi_warehouse',
    'advanced_reports',
    'abandoned_cart_recovery',
    'b2b_enabled',
    'api_access',
    'custom_domain',
    'gift_cards',
    'blog_module',
    'priority_support',
  ],
  enterprise: [
    'loyalty_program',
    'multi_warehouse',
    'advanced_reports',
    'abandoned_cart_recovery',
    'b2b_enabled',
    'api_access',
    'custom_domain',
    'gift_cards',
    'blog_module',
    'priority_support',
    'wholesale_pricing',
    'subscription_products',
    'marketplace_connect',
    'pos_module',
  ],
};