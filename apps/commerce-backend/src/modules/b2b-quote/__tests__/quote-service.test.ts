/**
 * B2B Quote (Teklif) servis testleri — Faz 9.
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
  createQuote,
  addQuoteItem,
  sendQuote,
  acceptQuote,
  rejectQuote,
  convertQuoteToOrder,
} from '../quote-service.js';

function makePrismaMock() {
  const quotes: any[] = [];
  const quoteItems: any[] = [];
  const dealerOrders: any[] = [];
  const history: any[] = [];
  let qSeq = 0;
  let itemSeq = 0;
  let doSeq = 0;

  return {
    prisma: {
      $transaction: async (ops: any) => {
        const list = Array.isArray(ops) ? ops : [ops];
        const results = [];
        for (const op of list) results.push(await op);
        return results;
      },
      quote: {
        findFirst: vi.fn(async ({ where, include }: any) => {
          const q = quotes.find((x) => x.id === where.id && x.tenantId === where.tenantId);
          if (!q) return null;
          if (include?.items) {
            return { ...q, items: quoteItems.filter((i) => i.quoteId === q.id) };
          }
          return q;
        }),
        create: vi.fn(async ({ data }: any) => {
          const q = {
            id: `qt-${++qSeq}`,
            ...data,
            createdAt: new Date(),
          };
          quotes.push(q);
          return q;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const q = quotes.find((x) => x.id === where.id);
          if (!q) throw new Error('Teklif yok');
          Object.assign(q, data);
          return q;
        }),
      },
      quoteItem: {
        create: vi.fn(async ({ data }: any) => {
          const item = { id: `qti-${++itemSeq}`, ...data };
          quoteItems.push(item);
          return item;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return quoteItems.filter((i) => i.quoteId === where.quoteId && i.tenantId === where.tenantId);
        }),
      },
      quoteStatusHistory: {
        create: vi.fn(async ({ data }: any) => {
          history.push(data);
          return data;
        }),
      },
      dealerOrder: {
        create: vi.fn(async ({ data }: any) => {
          const o = { id: `do-${++doSeq}`, ...data };
          dealerOrders.push(o);
          return o;
        }),
      },
    },
    quotes,
    quoteItems,
    history,
  };
}

describe('quote-service (Faz 9)', () => {
  let prisma: any;
  let quotes: any[];

  beforeEach(() => {
    const m = makePrismaMock();
    prisma = m.prisma;
    quotes = m.quotes;
  });

  it('createQuote: taslak teklif oluşturur', async () => {
    const result = await createQuote(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      createdById: 'user-1',
      title: 'Müşteri A teklif',
    });
    expect(result.quoteNumber).toMatch(/^QT-\d{8}-0001$/);
    expect(quotes[0].status).toBe('draft');
  });

  it('addQuoteItem: taslak teklifa kalem ekler', async () => {
    const q = await createQuote(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      createdById: 'user-1',
      title: 'Test',
    });
    await addQuoteItem(prisma, {
      tenantId: 'tenant-A',
      quoteId: q.id,
      productId: 'p-1',
      variantId: 'v-1',
      skuSnapshot: 'SKU-001',
      productTitle: 'Ürün 1',
      quantity: 10,
      unitPrice: 100,
      discountPercent: 10,
    });
    expect(quotes[0].totalAmount).toBe('900'); // 10 * 100 * 0.9
  });

  it('sendQuote: boş teklif gönderilemez', async () => {
    const q = await createQuote(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      createdById: 'user-1',
      title: 'Test',
    });
    await expect(sendQuote(prisma, 'tenant-A', q.id)).rejects.toThrow(/boş/);
  });

  it('sendQuote: kalemli teklif SENT olur', async () => {
    const q = await createQuote(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      createdById: 'user-1',
      title: 'Test',
    });
    await addQuoteItem(prisma, {
      tenantId: 'tenant-A',
      quoteId: q.id,
      productId: 'p-1',
      skuSnapshot: 'SKU-001',
      productTitle: 'Ürün',
      quantity: 5,
      unitPrice: 50,
    });
    await sendQuote(prisma, 'tenant-A', q.id);
    expect(quotes[0].status).toBe('sent');
  });

  it('acceptQuote: SENT → ACCEPTED', async () => {
    const q = await createQuote(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      createdById: 'user-1',
      title: 'Test',
    });
    await addQuoteItem(prisma, {
      tenantId: 'tenant-A',
      quoteId: q.id,
      productId: 'p',
      skuSnapshot: 'S',
      productTitle: 'X',
      quantity: 1,
      unitPrice: 100,
    });
    await sendQuote(prisma, 'tenant-A', q.id);
    await acceptQuote(prisma, 'tenant-A', q.id);
    expect(quotes[0].status).toBe('accepted');
  });

  it('rejectQuote: SENT → REJECTED', async () => {
    const q = await createQuote(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      createdById: 'user-1',
      title: 'Test',
    });
    await addQuoteItem(prisma, {
      tenantId: 'tenant-A',
      quoteId: q.id,
      productId: 'p',
      skuSnapshot: 'S',
      productTitle: 'X',
      quantity: 1,
      unitPrice: 100,
    });
    await sendQuote(prisma, 'tenant-A', q.id);
    await rejectQuote(prisma, 'tenant-A', q.id, 'Fiyat yüksek');
    expect(quotes[0].status).toBe('rejected');
  });

  it('convertQuoteToOrder: ACCEPTED teklifi DealerOrder oluşturur', async () => {
    const q = await createQuote(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      createdById: 'user-1',
      title: 'Test',
    });
    await addQuoteItem(prisma, {
      tenantId: 'tenant-A',
      quoteId: q.id,
      productId: 'p',
      skuSnapshot: 'S',
      productTitle: 'X',
      quantity: 2,
      unitPrice: 200,
    });
    await sendQuote(prisma, 'tenant-A', q.id);
    await acceptQuote(prisma, 'tenant-A', q.id);
    const order = await convertQuoteToOrder(prisma, 'tenant-A', q.id);
    expect(order.dealerOrderId).toMatch(/^do-/);
    expect(quotes[0].status).toBe('converted');
  });
});