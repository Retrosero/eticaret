/**
 * Cart servis birim testleri (mock prisma).
 *
 * Bu testlerde Prisma client mock'lanır; gerçek DB'ye dokunulmaz.
 * Amaç: cart-service'in sağlam input validasyonu ve tenant izolasyonu
 * davranışlarının korunduğunu doğrulamak.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// logger'ı mock'la
vi.mock('@eticart/config', () => ({
  createLogger: () => ({ info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }),
}));

import {
  addToCart,
  getOrCreateCart,
  recalculateCartTotals,
  removeCartItem,
  updateCartItem,
} from '../cart-service.js';

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

type CartRow = {
  id: string;
  tenantId: string;
  customerId: string | null;
  sessionKey: string | null;
  status: string;
  currency: string;
  subtotal: string;
  discountTotal: string;
  shippingTotal: string;
  taxTotal: string;
  grandTotal: string;
  expiresAt: Date | null;
};

type CartItemRow = {
  id: string;
  cartId: string;
  tenantId: string;
  productId: string | null;
  variantId: string | null;
  quantity: number;
  unitPrice: string;
  finalUnitPrice: string;
  lineTotal: string;
};

function makePrismaMock() {
  const carts: CartRow[] = [];
  const items: CartItemRow[] = [];
  let cartSeq = 0;
  let itemSeq = 0;

  const mock: any = {
    $transaction: async (ops: any) => {
      const list = Array.isArray(ops) ? ops : [ops];
      const results = [];
      for (const op of list) {
        results.push(await op);
      }
      return results;
    },
    cart: {
      findUnique: vi.fn(async ({ where }: any) => {
        return carts.find((c) => c.id === where.id) ?? null;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        return carts.find((c) => {
          if (c.tenantId !== where.tenantId) return false;
          if (where.customerId && c.customerId !== where.customerId) return false;
          if (where.sessionKey && c.sessionKey !== where.sessionKey) return false;
          if (where.status && c.status !== where.status) return false;
          return true;
        }) ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const cart: CartRow = {
          id: `cart-${++cartSeq}`,
          tenantId: data.tenantId,
          customerId: data.customerId ?? null,
          sessionKey: data.sessionKey ?? null,
          status: data.status,
          currency: data.currency ?? 'TRY',
          subtotal: data.subtotal ?? '0',
          discountTotal: data.discountTotal ?? '0',
          shippingTotal: data.shippingTotal ?? '0',
          taxTotal: data.taxTotal ?? '0',
          grandTotal: data.grandTotal ?? '0',
          expiresAt: data.expiresAt ?? null,
        };
        carts.push(cart);
        return cart;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const cart = carts.find((c) => c.id === where.id);
        if (!cart) throw new Error('Sepet bulunamadı');
        Object.assign(cart, data);
        return cart;
      }),
    },
    cartItem: {
      findUnique: vi.fn(async ({ where }: any) => {
        return (
          items.find(
            (i) =>
              i.cartId === where.cartId_variantId.cartId &&
              i.variantId === where.cartId_variantId.variantId,
          ) ?? null
        );
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        return items.find((i) => i.id === where.id && i.tenantId === where.tenantId) ?? null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return items.filter((i) => i.cartId === where.cartId);
      }),
      create: vi.fn(async ({ data }: any) => {
        const item: CartItemRow = {
          id: `item-${++itemSeq}`,
          cartId: data.cartId,
          tenantId: data.tenantId,
          productId: data.productId ?? null,
          variantId: data.variantId ?? null,
          quantity: data.quantity,
          unitPrice: String(data.unitPrice),
          finalUnitPrice: String(data.finalUnitPrice),
          lineTotal: String(data.lineTotal),
        };
        items.push(item);
        return item;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const item = items.find((i) => i.id === where.id);
        if (!item) throw new Error('Kalem bulunamadı');
        if (data.quantity !== undefined) item.quantity = data.quantity;
        if (data.lineTotal !== undefined) item.lineTotal = String(data.lineTotal);
        if (data.notes !== undefined) (item as any).notes = data.notes;
        return item;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const idx = items.findIndex((i) => i.id === where.id);
        if (idx >= 0) items.splice(idx, 1);
        return { id: where.id };
      }),
    },
  };

  return { prisma: mock, carts, items };
}

describe('cart-service', () => {
  let prisma: any;
  let carts: CartRow[];
  let items: CartItemRow[];

  beforeEach(() => {
    const m = makePrismaMock();
    prisma = m.prisma;
    carts = m.carts;
    items = m.items;
  });

  it('getOrCreateCart: yeni sepet oluşturur (sessionKey ile)', async () => {
    const cart = await getOrCreateCart(prisma, 'tenant-A', { sessionKey: 'sess-1' });
    expect(cart.id).toMatch(/^cart-/);
    expect(carts).toHaveLength(1);
    expect(carts[0]!.tenantId).toBe('tenant-A');
    expect(carts[0]!.sessionKey).toBe('sess-1');
  });

  it('getOrCreateCart: müşteri bağlı sepet için customerId kullanır', async () => {
    await getOrCreateCart(prisma, 'tenant-A', { customerId: 'cust-1' });
    expect(carts[0]!.customerId).toBe('cust-1');
  });

  it('getOrCreateCart: customerId veya sessionKey yoksa hata fırlatır', async () => {
    await expect(getOrCreateCart(prisma, 'tenant-A', {})).rejects.toThrow(/zorunlu/);
  });

  it('addToCart: yeni kalem ekler ve subtotal hesaplanır', async () => {
    const result = await addToCart(prisma, {
      tenantId: 'tenant-A',
      sessionKey: 'sess-1',
      productId: 'prod-1',
      variantId: 'var-1',
      name: 'Test Ürün',
      unitPrice: 100,
      quantity: 2,
    });
    expect(result.cartItemId).toMatch(/^item-/);
    expect(items).toHaveLength(1);
    expect(items[0]!.lineTotal).toBe('200');
  });

  it('addToCart: aynı varyant eklenirse miktar birleşir', async () => {
    await addToCart(prisma, {
      tenantId: 'tenant-A',
      sessionKey: 'sess-2',
      productId: 'prod-1',
      variantId: 'var-1',
      name: 'X',
      unitPrice: 50,
      quantity: 1,
    });
    await addToCart(prisma, {
      tenantId: 'tenant-A',
      sessionKey: 'sess-2',
      productId: 'prod-1',
      variantId: 'var-1',
      name: 'X',
      unitPrice: 50,
      quantity: 3,
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(4);
    expect(items[0]!.lineTotal).toBe('200');
  });

  it('addToCart: sıfır miktar reddedilir', async () => {
    await expect(
      addToCart(prisma, {
        tenantId: 'tenant-A',
        sessionKey: 'sess-3',
        productId: 'p',
        unitPrice: 10,
        quantity: 0,
        name: 'X',
      }),
    ).rejects.toThrow(/Geçersiz miktar/);
  });

  it('updateCartItem: miktar sıfıra düşerse kalem silinir', async () => {
    const { cartItemId } = await addToCart(prisma, {
      tenantId: 'tenant-A',
      sessionKey: 'sess-4',
      productId: 'p',
      variantId: 'v',
      unitPrice: 10,
      quantity: 1,
      name: 'X',
    });
    await updateCartItem(prisma, {
      tenantId: 'tenant-A',
      cartItemId,
      quantity: 0,
    });
    expect(items).toHaveLength(0);
  });

  it('updateCartItem: yanlış tenant için hata fırlatır', async () => {
    const { cartItemId } = await addToCart(prisma, {
      tenantId: 'tenant-A',
      sessionKey: 'sess-5',
      productId: 'p',
      variantId: 'v',
      unitPrice: 10,
      quantity: 1,
      name: 'X',
    });
    await expect(
      updateCartItem(prisma, {
        tenantId: 'tenant-B', // farklı tenant
        cartItemId,
        quantity: 2,
      }),
    ).rejects.toThrow(/bulunamadı/);
  });

  it('removeCartItem: kalemi siler', async () => {
    const { cartItemId } = await addToCart(prisma, {
      tenantId: 'tenant-A',
      sessionKey: 'sess-6',
      productId: 'p',
      variantId: 'v',
      unitPrice: 10,
      quantity: 1,
      name: 'X',
    });
    await removeCartItem(prisma, 'tenant-A', cartItemId);
    expect(items).toHaveLength(0);
  });

  it('recalculateCartTotals: subtotal ve grandTotal doğru hesaplanır', async () => {
    await addToCart(prisma, {
      tenantId: 'tenant-A',
      sessionKey: 'sess-7',
      productId: 'p1',
      variantId: 'v1',
      unitPrice: 25,
      quantity: 2,
      name: 'A',
    });
    await addToCart(prisma, {
      tenantId: 'tenant-A',
      sessionKey: 'sess-7',
      productId: 'p2',
      variantId: 'v2',
      unitPrice: 75,
      quantity: 1,
      name: 'B',
    });
    const totals = await recalculateCartTotals(prisma, carts[0]!.id);
    expect(totals.subtotal).toBe(125);
    expect(totals.grandTotal).toBe(125);
    expect(totals.itemCount).toBe(3);
  });
});