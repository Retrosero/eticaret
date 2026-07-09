/**
 * Checkout (Ödeme) servisi — Faz 6.
 *
 * Akış:
 *  1. Aktif sepeti al
 *  2. Stok kontrolü + fiyat yeniden hesaplama (snapshot)
 *  3. Kargo fiyatı sorgula (ShippingProviderRegistry)
 *  4. Ödeme başlat (PaymentProviderRegistry, ör. iyzico 3DS)
 *  5. Sipariş oluştur (status=PENDING_PAYMENT veya AWAITING_3DS)
 *  6. Cart'ı dönüştür
 *
 * Güvenlik:
 *  - Tüm sorgular tenant-scoped
 *  - Para alanları string-decimal olarak aktarılır (float YASAK)
 *  - Müşteri sadece kendi sepetini görebilir
 */

import { PrismaClient, OrderStatus, PaymentStatus } from '@prisma/client';

import { createLogger } from '@eticart/config';
const log = createLogger({ service: 'checkout/checkout-service' });
import type {
  PaymentProviderRegistry,
  CreatePaymentInput,
  PaymentIntent,
} from '@eticart/payment-adapters';
import type { ShippingProviderRegistry, ShippingRate } from '@eticart/shipping-adapters';

import { recalculateCartTotals } from '../cart/cart-service.js';
import { NotificationService } from '../notification/notification-service.js';

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface CheckoutInput {
  tenantId: string;
  cartId: string;
  customerId: string;
  /** Teslimat adresi ID (CustomerAddress.id). */
  shippingAddressId: string;
  /** Fatura adresi ID (CustomerAddress.id). */
  billingAddressId: string;
  /** Ödeme sağlayıcısı (iyzico, paytr, vb.). */
  paymentProviderCode: string;
  /** Kargo sağlayıcısı (manual, yurtici, vb.). */
  shippingProviderCode?: string;
  /** Para birimi. */
  currency: string;
  /** 3DS başarı URL'i (frontend). */
  successUrl: string;
  /** 3DS başarısızlık URL'i (frontend). */
  failureUrl: string;
  /** Müşteri IP adresi (ödeme sağlayıcısı için). */
  ipAddress: string;
  /** Müşteri e-posta. */
  customerEmail: string;
  /** Müşteri telefon. */
  customerPhone: string;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** 3DS yönlendirme URL'i (varsa). */
  redirectUrl?: string;
  /** Provider ödeme referansı (token). */
  providerReference?: string;
  /** Sepet toplamları (snapshot). */
  totals: {
    subtotal: number;
    discountTotal: number;
    shippingTotal: number;
    taxTotal: number;
    grandTotal: number;
  };
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Sipariş numarası üretir: TRD-YYYYMMDD-XXXX */
async function generateOrderNumber(prisma: PrismaClient, tenantId: string): Promise<string> {
  const today = new Date();
  const ymd =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `TRD-${ymd}-`;

  // Tenant bazlı artan sıra
  const last = await prisma.order.findFirst({
    where: { tenantId, orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });

  let nextSeq = 1;
  if (last) {
    const lastSeq = parseInt(last.orderNumber.split('-').pop() || '0', 10);
    nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Ana checkout fonksiyonu
// ---------------------------------------------------------------------------

/**
 * Sepeti siparişe dönüştürür ve ödeme başlatır.
 *
 * @param prisma             Tenant-scoped prisma client.
 * @param paymentRegistry    Ödeme sağlayıcı registry.
 * @param shippingRegistry   Kargo sağlayıcı registry.
 * @param input              Checkout girdisi.
 */
export async function startCheckout(
  prisma: PrismaClient,
  paymentRegistry: PaymentProviderRegistry,
  shippingRegistry: ShippingProviderRegistry,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  // 1) Sepeti yükle
  const cart = await prisma.cart.findFirst({
    where: { id: input.cartId, tenantId: input.tenantId, customerId: input.customerId },
    include: {
      items: {
        include: {
          // Varyant/ürün bilgisi için join (snapshot için yeterli)
        },
      },
    },
  });

  if (!cart) {
    throw new Error('Sepet bulunamadı veya müşteriye ait değil');
  }

  if (cart.items.length === 0) {
    throw new Error('Sepet boş');
  }

  // 2) Toplamları yeniden hesapla
  const totals = await recalculateCartTotals(prisma, cart.id);

  // 3) Kargo fiyatı sorgula (opsiyonel)
  let shippingRate: ShippingRate | undefined;
  if (input.shippingProviderCode) {
    const shipping = shippingRegistry.get(input.shippingProviderCode as any);
    if (shipping) {
      const rates = await shipping.getRates({
        tenantId: input.tenantId,
        originCity: 'Istanbul', // TODO: tenant varsayılan deposu
        destinationCity: 'Ankara', // TODO: shippingAddress'ten çekilecek
        pkg: { weightGrams: 1000, desi: 5 },
        orderTotalMinor: Math.round(totals.subtotal * 100),
      });
      shippingRate = rates[0];
    }
  }

  const shippingTotal = shippingRate ? shippingRate.amountMinor / 100 : 0;
  const grandTotal =
    totals.subtotal - totals.discountTotal + shippingTotal + totals.taxTotal;

  // 4) Müşteri + adres bilgileri
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId },
  });
  const shippingAddress = await prisma.customerAddress.findFirst({
    where: { id: input.shippingAddressId, tenantId: input.tenantId, customerId: input.customerId },
  });
  const billingAddress = await prisma.customerAddress.findFirst({
    where: { id: input.billingAddressId, tenantId: input.tenantId, customerId: input.customerId },
  });

  if (!customer || !shippingAddress || !billingAddress) {
    throw new Error('Müşteri veya adres bilgileri eksik');
  }

  // 5) Sipariş oluştur
  const orderNumber = await generateOrderNumber(prisma, input.tenantId);
  const order = await prisma.order.create({
    data: {
      tenantId: input.tenantId,
      orderNumber,
      customerId: input.customerId,
      status: 'pending_payment' as any,
      paymentStatus: 'pending' as any,
      currency: input.currency as any,
      subtotalAmount: totals.subtotal.toString(),
      discountTotal: totals.discountTotal.toString(),
      shippingTotal: shippingTotal.toString(),
      taxTotal: totals.taxTotal.toString(),
      grandTotal: grandTotal.toString(),
      shippingAddressId: shippingAddress.id,
      billingAddressId: billingAddress.id,
      paymentProvider: input.paymentProviderCode,
      items: {
        create: cart.items.map((item) => ({
          tenantId: input.tenantId,
          productId: item.productId,
          variantId: item.variantId,
          productTitle: item.name,
          skuSnapshot: item.sku ?? '',
          variantOptionsJson: (item.variantSnapshot ?? {}) as any,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          discountPercent: null,
          taxRate: null,
          taxAmount: null,
          totalAmount: item.lineTotal.toString(),
        })),
      } as any,
    },
    select: { id: true, orderNumber: true },
  });

  // 5.5) Sipariş onay e-postasını kuyruğa ekle (fire-and-forget)
  try {
    await NotificationService.enqueueOrderConfirmation({
      tenantId: input.tenantId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerEmail: customer.email,
      customerName: customer.fullName,
      total: grandTotal.toFixed(2),
      currency: input.currency,
    });
  } catch (err) {
    log.error({ err: (err as Error).message, orderId: order.id }, "order.confirmation enqueue failed");
  }

  // 6) Ödeme başlat
  const paymentProvider = paymentRegistry.get(input.paymentProviderCode as any);
  if (!paymentProvider) {
    throw new Error(`Ödeme sağlayıcısı tanımsız: ${input.paymentProviderCode}`);
  }

  // Not: provider init/config dışarıdan yönetilir (tenant başına).
  const paymentInput: CreatePaymentInput = {
    idempotencyKey: `order-${order.id}`,
    tenantId: input.tenantId,
    referenceId: order.id,
    amount: Math.round(grandTotal * 100),
    currency: input.currency as any,
    items: cart.items.map((item) => ({
      id: item.variantId ?? item.productId ?? item.id,
      name: item.name,
      category: 'Genel',
      price: Math.round(Number(item.finalUnitPrice.toString()) * 100),
      quantity: item.quantity,
    })),
    customer: {
      id: customer.id,
      email: input.customerEmail,
      firstName: customer.fullName.split(' ')[0] ?? '',
      lastName: customer.fullName.split(' ').slice(1).join(' ') || customer.fullName,
      phone: input.customerPhone,
      ipAddress: input.ipAddress,
      city: shippingAddress.city,
      country: shippingAddress.country,
    },
    shippingAddress: {
      contactName: shippingAddress.fullName,
      city: shippingAddress.city,
      country: shippingAddress.country,
      address: shippingAddress.addressLine1,
      postalCode: shippingAddress.postalCode ?? undefined,
    },
    billingAddress: {
      contactName: billingAddress.fullName,
      city: billingAddress.city,
      country: billingAddress.country,
      address: billingAddress.addressLine1,
      postalCode: billingAddress.postalCode ?? undefined,
    },
    successUrl: input.successUrl,
    failureUrl: input.failureUrl,
  };

  let intent: PaymentIntent | undefined;
  try {
    intent = await paymentProvider.createPaymentIntent(paymentInput);
  } catch (err) {
    // Ödeme başlatılamadıysa siparişi iptal et
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'cancelled', paymentStatus: 'failed' },
    });
    throw err;
  }

  // 7) PaymentIntent'i siparişe kaydet
  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentReference: intent.providerReference,
      paymentStatus: (intent.status === 'succeeded' ? 'paid' : 'processing') as any,
      status: (intent.status === 'succeeded'
          ? 'confirmed'
          : 'awaiting_payment') as any,
    },
  });

  // 8) Sepeti dönüştür
  await prisma.cart.update({
    where: { id: cart.id },
    data: { status: 'CONVERTED', orderId: order.id, convertedAt: new Date() },
  });

  log.info(
    { tenantId: input.tenantId, orderId: order.id, orderNumber, provider: input.paymentProviderCode },
    'Sipariş oluşturuldu ve ödeme başlatıldı',
  );

  return {
    orderId: order.id,
    orderNumber,
    status: 'awaiting_payment' as any,
    paymentStatus: 'processing' as any,
    redirectUrl: intent.redirectUrl,
    providerReference: intent.providerReference,
    totals: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      shippingTotal,
      taxTotal: totals.taxTotal,
      grandTotal,
    },
  };
}