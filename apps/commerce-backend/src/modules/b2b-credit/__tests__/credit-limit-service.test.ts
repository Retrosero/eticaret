/**
 * B2B Credit Limit servis testleri — Faz 9.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@eticart/config', () => ({
  createLogger: () => ({
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

import {
  setCreditLimit,
  checkCreditAvailability,
  reserveCredit,
  releaseCredit,
  __resetCreditStateForTest,
} from '../credit-limit-service.js';

function makePrismaMock() {
  const companies: any[] = [];
  const history: any[] = [];
  let cSeq = 0;
  let hSeq = 0;

  return {
    prisma: {
      companyAccount: {
        findFirst: vi.fn(async ({ where }: any) => {
          const c = companies.find(
            (x) => x.id === where.id && x.tenantId === where.tenantId,
          );
          if (c) return c;
          // İlk çağrıda yoksa oluştur (varsayımsal)
          const created = { id: where.id, tenantId: where.tenantId };
          companies.push(created);
          return created;
        }),
      },
      creditLimitHistory: {
        create: vi.fn(async ({ data }: any) => {
          const h = { id: `clh-${++hSeq}`, ...data };
          history.push(h);
          return h;
        }),
      },
    },
    companies,
    history,
  };
}

describe('credit-limit-service (Faz 9)', () => {
  let prisma: any;
  let history: any[];

  beforeEach(() => {
    const m = makePrismaMock();
    prisma = m.prisma;
    history = m.history;
    __resetCreditStateForTest();
  });

  it('setCreditLimit: yeni limit oluşturur ve history yazar', async () => {
    const result = await setCreditLimit(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      limitAmount: 50000,
      paymentTermDays: 30,
    });
    expect(result.id).toMatch(/^clh-/);
    expect(history[0].newLimit).toBe('50000');
    expect(history[0].previousLimit).toBe('0');
  });

  it('setCreditLimit: mevcut limiti günceller', async () => {
    await setCreditLimit(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      limitAmount: 50000,
      paymentTermDays: 30,
    });
    await setCreditLimit(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      limitAmount: 100000,
      paymentTermDays: 60,
    });
    expect(history).toHaveLength(2);
    expect(history[1].previousLimit).toBe('50000');
    expect(history[1].newLimit).toBe('100000');
  });

  it('checkCreditAvailability: limit yoksa reddeder', async () => {
    const result = await checkCreditAvailability(prisma, 'tenant-A', 'comp-new', 1000);
    expect(result.approved).toBe(false);
  });

  it('checkCreditAvailability: yeterli kredi varsa onaylar', async () => {
    await setCreditLimit(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      limitAmount: 10000,
      paymentTermDays: 30,
    });
    const result = await checkCreditAvailability(prisma, 'tenant-A', 'comp-1', 3000);
    expect(result.approved).toBe(true);
    expect(result.availableAmount).toBe(10000);
    expect(result.autoApproved).toBe(false);
  });

  it('checkCreditAvailability: threshold altında otomatik onay', async () => {
    await setCreditLimit(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      limitAmount: 10000,
      paymentTermDays: 30,
      autoApproveUnderLimit: 5000,
    });
    const result = await checkCreditAvailability(prisma, 'tenant-A', 'comp-1', 3000);
    expect(result.autoApproved).toBe(true);
  });

  it('checkCreditAvailability: kullanım aşıldıysa reddeder', async () => {
    await setCreditLimit(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      limitAmount: 10000,
      paymentTermDays: 30,
    });
    await reserveCredit(prisma, 'tenant-A', 'comp-1', 8000, 'order-1');
    const result = await checkCreditAvailability(prisma, 'tenant-A', 'comp-1', 3000);
    expect(result.approved).toBe(false);
    expect(result.availableAmount).toBe(2000);
  });

  it('reserveCredit: kullanımı artırır ve history kaydeder', async () => {
    await setCreditLimit(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      limitAmount: 10000,
      paymentTermDays: 30,
    });
    await reserveCredit(prisma, 'tenant-A', 'comp-1', 5000, 'order-1');
    expect(history).toHaveLength(2); // setCreditLimit + reserveCredit
    expect(history[1].reason).toContain('order-1');
    expect(history[1].reason).toContain('5000');
  });

  it('releaseCredit: ödeme sonrası kullanımı düşürür', async () => {
    await setCreditLimit(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      limitAmount: 10000,
      paymentTermDays: 30,
    });
    await reserveCredit(prisma, 'tenant-A', 'comp-1', 5000, 'order-1');
    await releaseCredit(prisma, 'tenant-A', 'comp-1', 5000, 'order-1');
    const result = await checkCreditAvailability(prisma, 'tenant-A', 'comp-1', 1000);
    expect(result.currentUsage).toBe(0);
    expect(result.availableAmount).toBe(10000);
  });
});