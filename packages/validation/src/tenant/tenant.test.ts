/**
 * @eticart/validation/tenant şemaları için birim testleri.
 */

import { describe, it, expect } from 'vitest';
import {
  createTenantSchema,
  updateTenantSchema,
  addDomainSchema,
  licenseKeySchema,
  upsertPlanSchema,
} from './index.js';

describe('@eticart/validation/tenant', () => {
  it('geçerli tenant isteğini kabul eder', () => {
    const out = createTenantSchema.safeParse({
      slug: 'acme',
      name: 'Acme Mağazası',
      plan: 'starter',
    });
    expect(out.success).toBe(true);
  });

  it('geçersiz slug formatını reddeder', () => {
    const out = createTenantSchema.safeParse({
      slug: 'ACME Ürünler',
      name: 'Acme',
    });
    expect(out.success).toBe(false);
  });

  it('plan varsayılan olarak starter atar', () => {
    const out = createTenantSchema.parse({
      slug: 'acme-2',
      name: 'Acme',
    });
    expect(out.plan).toBe('starter');
  });

  it('createTenantSchema trialDays varsayılanını 14 yapar', () => {
    const out = createTenantSchema.parse({
      slug: 'trialco',
      name: 'Trial Co',
    });
    expect(out.trialDays).toBe(14);
    expect(out.currency).toBe('TRY');
  });

  it('updateTenantSchema tüm alanları opsiyonel kabul eder', () => {
    expect(updateTenantSchema.safeParse({}).success).toBe(true);
    expect(
      updateTenantSchema.safeParse({ status: 'active' }).success,
    ).toBe(true);
    expect(
      updateTenantSchema.safeParse({ status: 'invalid' }).success,
    ).toBe(false);
  });

  it('addDomainSchema geçerli domain kabul eder, alt domain ile birlikte', () => {
    const out = addDomainSchema.safeParse({
      domain: 'www.acme.com',
      type: 'custom',
    });
    expect(out.success).toBe(true);
  });

  it('addDomainSchema ".." veya boş alan adını reddeder', () => {
    const out = addDomainSchema.safeParse({ domain: 'no-tld' });
    expect(out.success).toBe(false);
  });

  it('licenseKeySchema yalnızca geçerli formatta anahtarı kabul eder', () => {
    expect(licenseKeySchema.safeParse('ABCD-1234-EFGH-5678').success).toBe(true);
    expect(licenseKeySchema.safeParse('abcd-1234-efgh-5678').success).toBe(false);
    expect(licenseKeySchema.safeParse('ABC-1234-EFGH-5678').success).toBe(false);
  });

  it('upsertPlanSchema geçerli paket tanımını kabul eder', () => {
    const out = upsertPlanSchema.safeParse({
      code: 'growth',
      name: 'Growth',
      description: 'Büyüyen işletmeler için',
      monthlyPriceKurus: 49900,
      yearlyPriceKurus: 499000,
      trialDays: 14,
      maxUsers: 5,
      maxProducts: 1000,
      maxOrdersPerMonth: 5000,
      maxStorageBytes: 5 * 1024 * 1024 * 1024,
      features: [{ featureKey: 'multi_warehouse', enabled: true }],
    });
    expect(out.success).toBe(true);
  });
});