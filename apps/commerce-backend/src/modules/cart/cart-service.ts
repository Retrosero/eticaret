/**
 * Sepet (Cart) servisi — Faz 6.
 *
 * Sorumluluklar:
 *  - Sepet oluşturma / getirme (anonim veya müşteriye bağlı)
 *  - Sepete kalem ekleme / güncelleme / kaldırma
 *  - Toplam hesaplama (ara toplam, indirim, vergi, kargo, genel toplam)
 *  - Vagon terk / dönüşüm durumu yönetimi
 *  - Tenant izolasyonu (tüm sorgularda tenantId filtresi)
 *
 * Para alanları `Decimal(15,4)` üzerinden işlenir (float KULLANILMAZ).
 */

import { PrismaClient, CartStatus, CartItemKind, Prisma } from '@prisma/client';

import { createLogger } from '@eticart/config';
const log = createLogger({ service: 'cart/cart-service' });
import { Decimal } from '@prisma/client/runtime/library';

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface AddToCartInput {
  tenantId: string;
  customerId?: string | null;
  sessionKey?: string | null;
  productId: string;
  variantId?: string | null;
  kind?: CartItemKind;
  name: string;
  sku?: string | null;
  unitPrice: number;
  quantity: number;
  variantSnapshot?: Record<string, unknown> | null;
  notes?: string | null;
}

export interface UpdateCartItemInput {
  tenantId: string;
  cartItemId: string;
  quantity?: number;
  notes?: string | null;
}

export interface CartTotals {
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  itemCount: number;
}

// ---------------------------------------------------------------------------
// Sepet servis fonksiyonları
// ---------------------------------------------------------------------------

/**
 * Mevcut aktif sepeti getirir veya yeni oluşturur.
 *
 * @param prisma Tenant-scoped prisma client.
 * @param tenantId Aktif tenant.
 * @param opts    customerId veya sessionKey zorunlu.
 */
export async function getOrCreateCart(
  prisma: PrismaClient,
  tenantId: string,
  opts: { customerId?: string | null; sessionKey?: string | null },
): Promise<{ id: string; sessionKey: string | null; customerId: string | null }> {
  const sessionKey = opts.sessionKey ?? null;
  const customerId = opts.customerId ?? null;

  if (!customerId && !sessionKey) {
    throw new Error('Sepet oluşturmak için customerId veya sessionKey zorunlu');
  }

  // Önce mevcut sepeti ara
  const where: Prisma.CartWhereInput = {
    tenantId,
    status: CartStatus.ACTIVE,
    ...(customerId ? { customerId } : { sessionKey }),
  };

  const existing = await prisma.cart.findFirst({
    where,
    select: { id: true, sessionKey: true, customerId: true },
  });

  if (existing) {
    return existing;
  }

  // Yeni sepet oluştur
  const created = await prisma.cart.create({
    data: {
      tenantId,
      customerId: customerId ?? undefined,
      sessionKey: sessionKey ?? undefined,
      currency: 'TRY',
      status: CartStatus.ACTIVE,
      expiresAt: sessionKey ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
    },
    select: { id: true, sessionKey: true, customerId: true },
  });

  log.info({ tenantId, cartId: created.id }, 'Yeni sepet oluşturuldu');
  return created;
}

/**
 * Sepete kalem ekler. Aynı varyant zaten varsa miktar arttırılır.
 */
export async function addToCart(
  prisma: PrismaClient,
  input: AddToCartInput,
): Promise<{ cartId: string; cartItemId: string }> {
  if (input.quantity <= 0) {
    throw new Error('Geçersiz miktar: sıfır veya negatif olamaz');
  }

  const cart = await getOrCreateCart(prisma, input.tenantId, {
    customerId: input.customerId,
    sessionKey: input.sessionKey,
  });

  const unitPrice = new Decimal(input.unitPrice);
  const lineTotal = unitPrice.mul(input.quantity);

  // Varyant zaten sepetteyse miktarı güncelle
  if (input.variantId) {
    const existing = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
    });

    if (existing) {
      const newQuantity = existing.quantity + input.quantity;
      const newLineTotal = unitPrice.mul(newQuantity);
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: newQuantity,
          lineTotal: newLineTotal.toString(),
          updatedAt: new Date(),
        },
      });
      await recalculateCartTotals(prisma, cart.id);
      return { cartId: cart.id, cartItemId: existing.id };
    }
  }

  const item = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      tenantId: input.tenantId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      kind: input.kind ?? CartItemKind.PRODUCT,
      name: input.name,
      sku: input.sku ?? null,
      quantity: input.quantity,
      unitPrice: unitPrice.toString(),
      finalUnitPrice: unitPrice.toString(),
      lineTotal: lineTotal.toString(),
      variantSnapshot: input.variantSnapshot
        ? (input.variantSnapshot as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      notes: input.notes ?? null,
    },
  });

  await recalculateCartTotals(prisma, cart.id);
  log.info({ tenantId: input.tenantId, cartId: cart.id, cartItemId: item.id }, 'Sepete kalem eklendi');
  return { cartId: cart.id, cartItemId: item.id };
}

/**
 * Sepet kalemi günceller (miktar/not).
 */
export async function updateCartItem(
  prisma: PrismaClient,
  input: UpdateCartItemInput,
): Promise<void> {
  const item = await prisma.cartItem.findFirst({
    where: { id: input.cartItemId, tenantId: input.tenantId },
  });

  if (!item) {
    throw new Error('Sepet kalemi bulunamadı');
  }

  if (input.quantity !== undefined) {
    if (input.quantity <= 0) {
      // Miktar 0 veya altı → kalemi sil
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      const unitPrice = new Decimal(item.finalUnitPrice.toString());
      const newLineTotal = unitPrice.mul(input.quantity);
      await prisma.cartItem.update({
        where: { id: item.id },
        data: {
          quantity: input.quantity,
          lineTotal: newLineTotal.toString(),
          notes: input.notes ?? undefined,
          updatedAt: new Date(),
        },
      });
    }
  } else if (input.notes !== undefined) {
    await prisma.cartItem.update({
      where: { id: item.id },
      data: { notes: input.notes, updatedAt: new Date() },
    });
  }

  await recalculateCartTotals(prisma, item.cartId);
}

/**
 * Sepet kalemini siler.
 */
export async function removeCartItem(
  prisma: PrismaClient,
  tenantId: string,
  cartItemId: string,
): Promise<void> {
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, tenantId },
    select: { id: true, cartId: true },
  });

  if (!item) {
    throw new Error('Sepet kalemi bulunamadı');
  }

  await prisma.cartItem.delete({ where: { id: item.id } });
  await recalculateCartTotals(prisma, item.cartId);
}

/**
 * Sepeti toplamlarını yeniden hesaplar.
 *
 * Basit model: indirim/kargo/vergi ileride kampanya/kargo modüllerinden set edilir.
 * Burada yalnızca subtotal ve grandTotal hesaplanır.
 */
export async function recalculateCartTotals(prisma: PrismaClient, cartId: string): Promise<CartTotals> {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    select: { discountTotal: true, shippingTotal: true, taxTotal: true },
  });

  if (!cart) {
    throw new Error('Sepet bulunamadı');
  }

  const items = await prisma.cartItem.findMany({
    where: { cartId },
    select: { quantity: true, lineTotal: true },
  });

  let subtotal = new Decimal(0);
  let itemCount = 0;
  for (const item of items) {
    subtotal = subtotal.add(new Decimal(item.lineTotal.toString()));
    itemCount += item.quantity;
  }

  const grandTotal = subtotal
    .sub(new Decimal(cart.discountTotal.toString()))
    .add(new Decimal(cart.shippingTotal.toString()))
    .add(new Decimal(cart.taxTotal.toString()));

  await prisma.cart.update({
    where: { id: cartId },
    data: {
      subtotal: subtotal.toString(),
      grandTotal: grandTotal.toString(),
      updatedAt: new Date(),
    },
  });

  return {
    subtotal: subtotal.toNumber(),
    discountTotal: Number(cart.discountTotal.toString()),
    shippingTotal: Number(cart.shippingTotal.toString()),
    taxTotal: Number(cart.taxTotal.toString()),
    grandTotal: grandTotal.toNumber(),
    itemCount,
  };
}

/**
 * Sepeti terkedilmiş olarak işaretler (zamanlayıcı job'ından çağrılır).
 */
export async function markCartAbandoned(prisma: PrismaClient, cartId: string): Promise<void> {
  await prisma.cart.update({
    where: { id: cartId },
    data: { status: CartStatus.ABANDONED, abandonedAt: new Date() },
  });
}

/**
 * Sepeti siparişe dönüştürür (sipariş oluşturulduktan sonra çağrılır).
 */
export async function convertCartToOrder(
  prisma: PrismaClient,
  cartId: string,
  orderId: string,
): Promise<void> {
  await prisma.cart.update({
    where: { id: cartId },
    data: {
      status: CartStatus.CONVERTED,
      orderId,
      convertedAt: new Date(),
    },
  });
}

/**
 * Vagon süresi dolmuş sepetleri temizler (cron job'ı).
 *
 * @returns Temizlenen sepet sayısı.
 */
export async function expireOldCarts(prisma: PrismaClient): Promise<number> {
  const result = await prisma.cart.updateMany({
    where: {
      status: CartStatus.ACTIVE,
      expiresAt: { lt: new Date() },
    },
    data: { status: CartStatus.EXPIRED },
  });
  return result.count;
}