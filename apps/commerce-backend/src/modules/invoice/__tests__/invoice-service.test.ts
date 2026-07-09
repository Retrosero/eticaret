/**
 * Invoice servis birim testleri (mock prisma).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@eticart/config', () => ({
  createLogger: () => ({ info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }),
}));

import { InvoiceStatus } from '@prisma/client';

import {
  createInvoice,
  cancelInvoice,
  listCustomerInvoices,
} from '../invoice-service.js';

function makePrismaMock() {
  const orders: any[] = [
    {
      id: 'order-1',
      tenantId: 'tenant-A',
      status: 'CONFIRMED',
      currency: 'TRY',
      subtotal: '100',
      discountTotal: '0',
      taxTotal: '18',
      shippingTotal: '10',
      totalAmount: '128', taxTotal: '18',
      customerId: 'cust-1',
    },
  ];
  const invoices: any[] = [];
  const sequences: any[] = [];
  let invSeq = 0;

  return {
    prisma: {
      $transaction: async (ops: any) => {
        // Callback form: (tx) => Promise<T> — tx'i transaction context olarak simüle et
        if (typeof ops === 'function') {
          return await ops(prisma);
        }
        // Array form: [op1, op2, ...]
        const list = Array.isArray(ops) ? ops : [ops];
        const results = [];
        for (const op of list) results.push(await op);
        return results;
      },
      order: {
        findFirst: vi.fn(async ({ where, include }: any) => {
          const o = orders.find((x) => x.id === where.id && x.tenantId === where.tenantId);
          if (!o) return null;
          return include?.items ? { ...o, items: [] } : o;
        }),
      },
      orderInvoice: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            invoices.find(
              (i) =>
                i.orderId === where.orderId &&
                i.tenantId === where.tenantId &&
                (where.status?.not ? i.status !== where.status.not : true),
            ) ?? null
          );
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          return invoices.find((i) => i.id === where.id) ?? null;
        }),
        findMany: vi.fn(async ({ where, include, skip = 0, take = 20 }: any) => {
          let rows = invoices.filter((i) => i.tenantId === where.tenantId);
          if (where.orderId) rows = rows.filter((i) => i.orderId === where.orderId);
          if (where.order?.customerId) rows = rows.filter((i) => i._customerId === where.order.customerId);
          rows = rows.slice(skip, skip + take);
          if (include?.order) {
            return rows.map((i) => ({ ...i, order: { orderNumber: 'TRD-001' } }));
          }
          return rows;
        }),
        count: vi.fn(async ({ where }: any) => {
          let rows = invoices;
          if (where?.tenantId) rows = rows.filter((i) => i.tenantId === where.tenantId);
          if (where?.order?.customerId) rows = rows.filter((i) => i._customerId === where.order.customerId);
          return rows.length;
        }),
        create: vi.fn(async ({ data }: any) => {
          const inv = {
            id: `inv-${++invSeq}`,
            ...data,
            status: typeof data.status === 'string' ? data.status : 'issued',
          };
          invoices.push(inv);
          return inv;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const inv = invoices.find((i) => i.id === where.id);
          if (!inv) throw new Error('Fatura yok');
          Object.assign(inv, data);
          return inv;
        }),
      },
      invoiceSequence: {
        findUnique: vi.fn(async ({ where }: any) => {
          return sequences.find((s) => s.tenantId === where.tenantId_year.tenantId && s.year === where.tenantId_year.year) ?? null;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const seq = sequences.find((s) => s.tenantId === where.tenantId_year.tenantId && s.year === where.tenantId_year.year);
          if (seq) {
            if (typeof data.lastValue === 'object' && data.lastValue?.increment) {
              seq.lastValue += data.lastValue.increment;
            } else {
              Object.assign(seq, data);
            }
          }
          return seq;
        }),
        create: vi.fn(async ({ data }: any) => {
          const seq = { ...data };
          sequences.push(seq);
          return seq;
        }),
      },
    },
    invoices,
    sequences,
  };
}

describe('invoice-service', () => {
  let prisma: any;
  let invoices: any[];
  let sequences: any[];

  beforeEach(() => {
    const m = makePrismaMock();
    prisma = m.prisma;
    invoices = m.invoices;
    sequences = m.sequences;
  });

  it('createInvoice: sipariş için fatura üretir', async () => {
    const inv = await createInvoice(prisma, {
      tenantId: 'tenant-A',
      orderId: 'order-1',
      type: 'e_arsiv',
      customerTaxId: '1234567890',
    });
    expect(inv.invoiceNumber).toMatch(/^INV-\d{8}-00001$/);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].status).toBe('issued');
  });

  it('createInvoice: aynı sipariş için tekrar çağrı mevcut faturayı döner', async () => {
    const inv1 = await createInvoice(prisma, {
      tenantId: 'tenant-A',
      orderId: 'order-1',
      type: 'e_arsiv',
    });
    const inv2 = await createInvoice(prisma, {
      tenantId: 'tenant-A',
      orderId: 'order-1',
      type: 'e_arsiv',
    });
    expect(inv1.id).toBe(inv2.id);
    expect(invoices).toHaveLength(1);
  });

  it('createInvoice: numara sırası artar', async () => {
    // İkinci sipariş oluştur
    prisma.order.findFirst.mockImplementation(async ({ where, include }: any) => {
      const o = orders.find ? orders.find((x) => x.id === where.id) : null;
      return o || {
        id: where.id,
        tenantId: 'tenant-A',
        status: 'CONFIRMED',
        currency: 'TRY',
        subtotal: '50',
        discountTotal: '0',
        taxTotal: '9',
        shippingTotal: '0',
        totalAmount: '59', taxTotal: '9',
      };
    });
    const orders = [
      { id: 'order-A', tenantId: 'tenant-A', status: 'CONFIRMED', currency: 'TRY', subtotal: '100', discountTotal: '0', taxTotal: '18', shippingTotal: '10', grandTotal: '128' },
      { id: 'order-B', tenantId: 'tenant-A', status: 'CONFIRMED', currency: 'TRY', subtotal: '50', discountTotal: '0', taxTotal: '9', shippingTotal: '0', grandTotal: '59' },
    ];
    prisma.order.findFirst.mockImplementation(async ({ where, include }: any) => {
      const o = orders.find((x) => x.id === where.id);
      return include?.items ? { ...o, items: [] } : o;
    });

    const inv1 = await createInvoice(prisma, { tenantId: 'tenant-A', orderId: 'order-A', type: 'e_arsiv' });
    const inv2 = await createInvoice(prisma, { tenantId: 'tenant-A', orderId: 'order-B', type: 'e_arsiv' });
    expect(inv1.invoiceNumber).toMatch(/00001$/);
    expect(inv2.invoiceNumber).toMatch(/00002$/);
  });

  it('cancelInvoice: faturayı iptal eder', async () => {
    const inv = await createInvoice(prisma, {
      tenantId: 'tenant-A',
      orderId: 'order-1',
      type: 'e_arsiv',
    });
    await cancelInvoice(prisma, 'tenant-A', inv.id, 'Müşteri talebi');
    expect(invoices[0].status).toBe('cancelled');
  });

  it('listCustomerInvoices: tenant izolasyonu uygular', async () => {
    await createInvoice(prisma, { tenantId: 'tenant-A', orderId: 'order-1', type: 'e_arsiv' });
    // tenant-B için sorgu
    const result = await listCustomerInvoices(prisma, 'tenant-B', 'cust-1');
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});