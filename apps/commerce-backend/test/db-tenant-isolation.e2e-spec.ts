/**
 * Gerçek PostgreSQL tenant izolasyonu.
 *
 * Çalıştırma:
 *   DATABASE_URL=postgresql://test:test@localhost:55434/eticart_test
 *   pnpm --filter @eticart/commerce-backend exec vitest run test/db-tenant-isolation.e2e-spec.ts
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

import {
  addToCart,
  getOrCreateCart,
  updateCartItem,
} from '../src/modules/cart/cart-service.js';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const suite = process.env['DATABASE_URL'] ? describe : describe.skip;

suite('E2E: gerçek DB tenant izolasyonu', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.cartItem.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.cart.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  });

  afterAll(async () => {
    await prisma.cartItem.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.cart.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.$disconnect();
  });

  it('aynı session key iki tenant için birbirine karışmaz', async () => {
    const sessionKey = `isolation-${Date.now()}`;
    const cartA = await getOrCreateCart(prisma, TENANT_A, { sessionKey });
    const cartB = await getOrCreateCart(prisma, TENANT_B, { sessionKey });

    expect(cartA.id).not.toBe(cartB.id);
    expect((await prisma.cart.findUnique({ where: { id: cartA.id } }))?.tenantId).toBe(TENANT_A);
    expect((await prisma.cart.findUnique({ where: { id: cartB.id } }))?.tenantId).toBe(TENANT_B);
  });

  it('tenant B, tenant A sepet kalemini güncelleyemez', async () => {
    const created = await addToCart(prisma, {
      tenantId: TENANT_A,
      sessionKey: `item-isolation-${Date.now()}`,
      productId: null as unknown as string,
      name: 'Tenant A ürün',
      unitPrice: 100,
      quantity: 1,
    });

    await expect(
      updateCartItem(prisma, {
        tenantId: TENANT_B,
        cartItemId: created.cartItemId,
        quantity: 99,
      }),
    ).rejects.toThrow('Sepet kalemi bulunamadı');

    const item = await prisma.cartItem.findUnique({ where: { id: created.cartItemId } });
    expect(item?.tenantId).toBe(TENANT_A);
    expect(item?.quantity).toBe(1);
  });

  it('tenant filtresi aynı ID üzerinden bile diğer tenant kaydını döndürmez', async () => {
    const productA = await prisma.product.create({
      data: { tenantId: TENANT_A, slug: `tenant-a-${Date.now()}`, title: 'A ürün', updatedAt: new Date() },
    });
    const productB = await prisma.product.create({
      data: { tenantId: TENANT_B, slug: `tenant-b-${Date.now()}`, title: 'B ürün', updatedAt: new Date() },
    });

    const tenantAProducts = await prisma.product.findMany({
      where: { tenantId: TENANT_A, id: { in: [productA.id, productB.id] } },
    });

    expect(tenantAProducts.map((product) => product.id)).toEqual([productA.id]);
    await prisma.product.deleteMany({ where: { id: { in: [productA.id, productB.id] } } });
  });
});
