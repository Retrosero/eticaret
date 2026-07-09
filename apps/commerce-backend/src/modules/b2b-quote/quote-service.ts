/**
 * B2B Teklif (Quote) servisi — Faz 8.
 *
 * Bayilerin müşterilerine özel teklifler hazırlaması için kullanılır.
 *
 * Şema notları:
 *  - Quote.status enum (QuoteStatus): draft, sent, accepted, rejected, converted, expired
 *  - QuoteItem: skuSnapshot (sku değil), unitPriceSnapshot (unitPrice değil), discountPercent
 *  - DealerOrder: orderNumber (snapshot), totalAmount (grandTotal değil), paymentTermId
 */

import { PrismaClient } from '@prisma/client';

import { createLogger } from '@eticart/config';
import { Decimal } from '@prisma/client/runtime/library';

const log = createLogger({ service: 'quote-service' });

const QUOTE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CONVERTED: 'converted',
  EXPIRED: 'expired',
} as const;

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface CreateQuoteInput {
  tenantId: string;
  companyAccountId: string;
  /** Teklifi oluşturan bayi kullanıcısı. */
  createdById: string;
  /** Teklif başlığı. */
  title: string;
  /** Satış temsilcisi (opsiyonel). */
  salesRepId?: string;
  /** Geçerlilik tarihi. */
  validUntil?: Date;
  /** Notlar. */
  notes?: string;
}

export interface AddQuoteItemInput {
  tenantId: string;
  quoteId: string;
  productId: string;
  variantId?: string | null;
  /** SKU snapshot. */
  skuSnapshot: string;
  productTitle: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discountFixed?: number;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Fonksiyonlar
// ---------------------------------------------------------------------------

/**
 * Yeni teklif taslağı oluşturur.
 */
export async function createQuote(
  prisma: PrismaClient,
  input: CreateQuoteInput,
): Promise<{ id: string; quoteNumber: string }> {
  const quoteNumber = await generateQuoteNumber(prisma, input.tenantId);

  const quote = await prisma.quote.create({
    data: {
      tenantId: input.tenantId,
      companyAccountId: input.companyAccountId,
      quoteNumber,
      title: input.title,
      createdById: input.createdById,
      salesRepId: input.salesRepId ?? null,
      status: QUOTE_STATUS.DRAFT,
      currency: 'TRY',
      validUntil: input.validUntil ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      totalAmount: '0',
      internalNote: input.notes ?? null,
    },
    select: { id: true, quoteNumber: true },
  });

  log.info({ tenantId: input.tenantId, quoteId: quote.id }, 'Teklif taslağı oluşturuldu');
  return quote;
}

/**
 * Teklife kalem ekler ve toplamları günceller.
 */
export async function addQuoteItem(
  prisma: PrismaClient,
  input: AddQuoteItemInput,
): Promise<{ id: string }> {
  const quote = await prisma.quote.findFirst({
    where: { id: input.quoteId, tenantId: input.tenantId },
    select: { id: true, status: true },
  });

  if (!quote) throw new Error('Teklif bulunamadı');
  if (quote.status !== QUOTE_STATUS.DRAFT) {
    throw new Error('Yalnızca taslak tekliflere kalem eklenebilir');
  }

  const unitPrice = new Decimal(input.unitPrice);
  const discountPercent = input.discountPercent ? new Decimal(input.discountPercent) : null;
  const discountFixed = input.discountFixed ? new Decimal(input.discountFixed) : null;

  // İskonto uygulanmış birim fiyat
  let finalUnitPrice = unitPrice;
  if (discountPercent) {
    finalUnitPrice = unitPrice.mul(new Decimal(1).sub(discountPercent.div(100)));
  }
  if (discountFixed) {
    finalUnitPrice = finalUnitPrice.sub(discountFixed);
  }
  const lineTotal = finalUnitPrice.mul(input.quantity);

  const item = await prisma.quoteItem.create({
    data: {
      tenantId: input.tenantId,
      quoteId: input.quoteId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      skuSnapshot: input.skuSnapshot,
      productTitle: input.productTitle,
      quantity: input.quantity,
      unitPriceSnapshot: unitPrice.toString(),
      discountPercent: discountPercent ? discountPercent.toString() : null,
      discountFixed: discountFixed ? discountFixed.toString() : null,
      lineTotal: lineTotal.toString(),
    },
    select: { id: true },
  });

  await recalculateQuoteTotals(prisma, input.tenantId, input.quoteId);
  return item;
}

/**
 * Teklifi müşteriye gönderir (draft → sent).
 */
export async function sendQuote(
  prisma: PrismaClient,
  tenantId: string,
  quoteId: string,
): Promise<void> {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId },
    include: { items: true },
  });

  if (!quote) throw new Error('Teklif bulunamadı');
  if (quote.status !== QUOTE_STATUS.DRAFT) throw new Error('Yalnızca taslak teklifler gönderilebilir');
  if (quote.items.length === 0) throw new Error('Teklif boş, kalem ekleyin');

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quoteId },
      data: { status: QUOTE_STATUS.SENT, sentAt: new Date() },
    }),
    prisma.quoteStatusHistory.create({
      data: {
        tenantId,
        quoteId,
        fromStatus: 'draft',
        toStatus: 'sent',
        note: 'Müşteriye gönderildi',
      },
    }),
  ]);

  log.info({ tenantId, quoteId }, 'Teklif müşteriye gönderildi');
}

/**
 * Müşteri teklifi kabul eder (sent → accepted).
 */
export async function acceptQuote(
  prisma: PrismaClient,
  tenantId: string,
  quoteId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quoteId },
      data: { status: QUOTE_STATUS.ACCEPTED, acceptedAt: new Date() },
    }),
    prisma.quoteStatusHistory.create({
      data: { tenantId, quoteId, fromStatus: 'sent', toStatus: 'accepted' },
    }),
  ]);
}

/**
 * Müşteri teklifi reddeder (sent → rejected).
 */
export async function rejectQuote(
  prisma: PrismaClient,
  tenantId: string,
  quoteId: string,
  reason: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quoteId },
      data: { status: QUOTE_STATUS.REJECTED, rejectedAt: new Date() },
    }),
    prisma.quoteStatusHistory.create({
      data: { tenantId, quoteId, fromStatus: 'sent', toStatus: 'rejected', note: reason },
    }),
  ]);
}

/**
 * Teklifi B2B siparişe dönüştürür (accepted → converted, DealerOrder oluşur).
 */
export async function convertQuoteToOrder(
  prisma: PrismaClient,
  tenantId: string,
  quoteId: string,
): Promise<{ dealerOrderId: string; orderNumber: string }> {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId },
    include: { items: true },
  });

  if (!quote) throw new Error('Teklif bulunamadı');
  if (quote.status !== QUOTE_STATUS.ACCEPTED) {
    throw new Error('Yalnızca kabul edilen teklifler siparişe dönüştürülebilir');
  }
  if (quote.items.length === 0) throw new Error('Teklif boş');

  const orderNumber = `DO-${quote.quoteNumber}`;

  const dealerOrder = await prisma.dealerOrder.create({
    data: {
      tenantId,
      companyAccountId: quote.companyAccountId,
      orderNumber,
      totalAmount: quote.totalAmount,
    },
    select: { id: true, orderNumber: true },
  });

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      status: QUOTE_STATUS.CONVERTED,
      convertedOrderNumber: dealerOrder.orderNumber,
    },
  });

  log.info(
    { tenantId, quoteId, dealerOrderId: dealerOrder.id },
    'Teklif B2B siparişe dönüştürüldü',
  );
  return { dealerOrderId: dealerOrder.id, orderNumber: dealerOrder.orderNumber };
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

async function generateQuoteNumber(prisma: PrismaClient, tenantId: string): Promise<string> {
  const today = new Date();
  const ymd =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `QT-${ymd}-`;

  const last = await prisma.quote.findFirst({
    where: { tenantId, quoteNumber: { startsWith: prefix } },
    orderBy: { quoteNumber: 'desc' },
    select: { quoteNumber: true },
  });

  let nextSeq = 1;
  if (last) {
    const lastSeq = parseInt(last.quoteNumber.split('-').pop() || '0', 10);
    nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

async function recalculateQuoteTotals(
  prisma: PrismaClient,
  tenantId: string,
  quoteId: string,
): Promise<void> {
  const items = await prisma.quoteItem.findMany({
    where: { tenantId, quoteId },
    select: { lineTotal: true, unitPriceSnapshot: true, quantity: true },
  });

  let subtotal = new Decimal(0);
  let grandTotal = new Decimal(0);

  for (const item of items) {
    const unitPrice = new Decimal(item.unitPriceSnapshot.toString());
    const lineBase = unitPrice.mul(item.quantity);
    subtotal = subtotal.add(lineBase);
    grandTotal = grandTotal.add(new Decimal(item.lineTotal.toString()));
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      totalAmount: grandTotal.toString(),
      updatedAt: new Date(),
    },
  });
}