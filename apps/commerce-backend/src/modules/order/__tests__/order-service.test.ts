/**
 * Order servis birim testleri (mock prisma).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@eticart/config', () => ({
  createLogger: () => ({ info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }),
}));

import {
  canTransition,
  transitionOrderStatus,
  listOrders,
  getOrderDetail,
  cancelOrder,
  startReturn,
  calculateRefundAmount,
  getCustomerPanelSummary,
} from '../order-service.js';

function makePrismaMock() {
  const orders: any[] = [];
  const rules: any[] = [];
  const history: any[] = [];
  let orderSeq = 0;

  return {
    prisma: {
      $transaction: async (ops: any) => {
        const list = Array.isArray(ops) ? ops : [ops];
        const results = [];
        for (const op of list) {
          results.push(await op);
        }
        return results;
      },
      order: {
        findFirst: vi.fn(async ({ where }: any) => {
          return orders.find((o) => o.id === where.id && o.tenantId === where.tenantId) ?? null;
        }),
        findMany: vi.fn(async ({ where, take = 20, skip = 0, include }: any) => {
          let rows = orders.filter((o) => o.tenantId === where.tenantId);
          if (where.customerId) rows = rows.filter((o) => o.customerId === where.customerId);
          if (where.status?.in) rows = rows.filter((o) => where.status.in.includes(o.status));
          rows = rows.slice(skip, skip + take);
          if (include?._count) {
            return rows.map((o) => ({ ...o, _count: { items: 3 } }));
          }
          return rows;
        }),
        count: vi.fn(async ({ where }: any) => {
          return orders.filter((o) => o.tenantId === where.tenantId).length;
        }),
        aggregate: vi.fn(async ({ where, _sum }: any) => {
          const matched = orders.filter((o) => o.tenantId === where.tenantId && (where.paymentStatus ? o.paymentStatus === where.paymentStatus : true));
          const sum = matched.reduce((acc, o) => acc + Number(o[_sum.grandTotal]?.toString?.() ?? o[_sum.grandTotal] ?? '0'), 0);
          return { _sum: { grandTotal: sum.toString() } };
        }),
        create: vi.fn(async ({ data }: any) => {
          const o = {
            id: `order-${++orderSeq}`,
            ...data,
            createdAt: new Date(),
          };
          orders.push(o);
          return o;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const o = orders.find((x) => x.id === where.id);
          if (!o) throw new Error('Sipariş yok');
          Object.assign(o, data);
          return o;
        }),
      },
      orderStatusMachineRule: {
        findUnique: vi.fn(async () => null),
      },
      orderStatusHistory: {
        create: vi.fn(async ({ data }: any) => {
          history.push(data);
          return data;
        }),
      },
      orderInvoice: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    },
    orders,
    history,
  };
}

describe('order-service', () => {
  let prisma: any;
  let orders: any[];

  beforeEach(() => {
    const m = makePrismaMock();
    prisma = m.prisma;
    orders = m.orders;
  });

  describe('canTransition', () => {
    it('izinli geçişleri tanır', () => {
      expect(canTransition('confirmed', 'preparing')).toBe(true);
      expect(canTransition('preparing', 'shipped')).toBe(true);
      expect(canTransition('shipped', 'delivered')).toBe(true);
    });

    it('yasaklı geçişleri reddeder', () => {
      expect(canTransition('delivered', 'preparing')).toBe(false);
      expect(canTransition('closed', 'confirmed')).toBe(false);
    });

    it('iptal akışı birçok durumdan mümkün', () => {
      expect(canTransition('pending_payment', 'cancelled')).toBe(true);
      expect(canTransition('awaiting_payment', 'cancelled')).toBe(true);
      expect(canTransition('confirmed', 'cancelled')).toBe(true);
    });
  });

  describe('transitionOrderStatus', () => {
    beforeEach(() => {
      orders.push({
        id: 'order-1',
        tenantId: 'tenant-A',
        customerId: 'cust-1',
        status: 'confirmed',
        paymentStatus: 'paid',
        grandTotal: '100',
        currency: 'TRY',
        subtotal: '90',
        discountTotal: '0',
        shippingTotal: '10',
        taxTotal: '0',
        refundAmount: null,
      });
    });

    it('geçerli geçiş yapar', async () => {
      const result = await transitionOrderStatus(prisma, 'tenant-A', 'order-1', 'preparing', 'user-1');
      expect(result.status).toBe('preparing');
      expect(orders[0].status).toBe('preparing');
    });

    it('geçersiz geçiş hata fırlatır', async () => {
      await expect(
        transitionOrderStatus(prisma, 'tenant-A', 'order-1', 'refunded', 'user-1'),
      ).rejects.toThrow(/Geçersiz durum geçişi/);
    });

    it('yanlış tenant hata fırlatır', async () => {
      await expect(
        transitionOrderStatus(prisma, 'tenant-B', 'order-1', 'preparing', 'user-1'),
      ).rejects.toThrow(/bulunamadı/);
    });
  });

  describe('listOrders', () => {
    beforeEach(() => {
      orders.push(
        { id: '1', tenantId: 'tenant-A', customerId: 'cust-1', status: 'confirmed', grandTotal: '100', currency: 'TRY', createdAt: new Date() },
        { id: '2', tenantId: 'tenant-A', customerId: 'cust-1', status: 'shipped', grandTotal: '200', currency: 'TRY', createdAt: new Date() },
        { id: '3', tenantId: 'tenant-A', customerId: 'cust-2', status: 'delivered', grandTotal: '50', currency: 'TRY', createdAt: new Date() },
        { id: '4', tenantId: 'tenant-B', customerId: 'cust-1', status: 'confirmed', grandTotal: '999', currency: 'TRY', createdAt: new Date() },
      );
    });

    it('tenant izolasyonu uygular', async () => {
      const result = await listOrders(prisma, { tenantId: 'tenant-A' });
      expect(result.items).toHaveLength(3);
      expect(result.items.every((o) => o.id !== '4')).toBe(true);
    });

    it('customerId filtresi', async () => {
      const result = await listOrders(prisma, { tenantId: 'tenant-A', customerId: 'cust-1' });
      expect(result.items).toHaveLength(2);
    });

    it('status filtresi', async () => {
      const result = await listOrders(prisma, { tenantId: 'tenant-A', status: ['confirmed', 'shipped'] });
      expect(result.items).toHaveLength(2);
    });
  });

  describe('calculateRefundAmount', () => {
    beforeEach(() => {
      orders.push({
        id: 'order-r',
        tenantId: 'tenant-A',
        grandTotal: '500',
        refundedAmount: '100',
      });
    });

    it('kalan iade tutarını hesaplar', async () => {
      const remaining = await calculateRefundAmount(prisma, 'tenant-A', 'order-r');
      expect(remaining).toBe(400);
    });
  });
});