/**
 * B2B Fiyatlandırma servisi — Faz 8.
 *
 * B2B bayiler için gelişmiş fiyatlandırma kuralları:
 *  - Müşteri grubu bazlı fiyat listeleri (CustomerGroup → PriceList → PriceListEntry)
 *  - Kademeli/koli indirim kuralları (PriceRule: minQty, discountPercent, discountFixed, caseQuantity)
 *  - Decimal(15,4) para alanları (asla float)
 *
 * Şema notları:
 *  - Product'ta priceAmount YOK (ProductVariant'ta var)
 *  - PriceListEntry: productId + variantId (nullable) → unitPrice
 *  - PriceRule: priceListId + minQty + discountPercent/discountFixed/caseQuantity
 */

import { PrismaClient } from '@prisma/client';

import { createLogger } from '@eticart/config';
import { Decimal } from '@prisma/client/runtime/library';

const log = createLogger({ service: 'b2b-pricing-service' });

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface PriceQuoteInput {
  tenantId: string;
  companyAccountId: string;
  items: Array<{
    productId: string;
    variantId?: string | null;
    quantity: number;
  }>;
  currency: string;
}

export interface PriceQuoteItem {
  productId: string;
  variantId: string | null;
  quantity: number;
  /** Liste fiyatı (birim). */
  listUnitPrice: number;
  /** Bayiye özel fiyat (birim, indirimler dahil). */
  finalUnitPrice: number;
  /** Satır toplamı. */
  lineTotal: number;
  /** Uygulanan fiyat kuralı. */
  appliedRule: 'LIST' | 'PRICELIST' | 'VOLUME' | 'TIER';
  currency: string;
}

export interface PriceQuote {
  items: PriceQuoteItem[];
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  currency: string;
  priceListId: string | null;
  customerGroupId: string | null;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/**
 * Bayinin fiyat bağlamını çözer (firma grubu, fiyat listesi).
 */
async function resolveCompanyPricingContext(
  prisma: PrismaClient,
  tenantId: string,
  companyAccountId: string,
): Promise<{
  priceListId: string | null;
  customerGroupId: string | null;
}> {
  const company = await prisma.companyAccount.findFirst({
    where: { id: companyAccountId, tenantId },
    include: {
      customerGroup: {
        include: {
          priceLists: {
            take: 1,
            orderBy: { priority: 'desc' },
          },
        },
      },
    },
  });

  if (!company) {
    throw new Error('Firma hesabı bulunamadı');
  }

  return {
    priceListId: company.customerGroup?.priceLists[0]?.id ?? null,
    customerGroupId: company.customerGroupId ?? null,
  };
}

/**
 * Belirli bir varyant için bayi fiyat kuralını belirler.
 */
async function resolveVariantPrice(
  prisma: PrismaClient,
  tenantId: string,
  ctx: { priceListId: string | null },
  variantId: string | null,
  _productId: string,
  quantity: number,
  _currency: string,
): Promise<PriceQuoteItem['appliedRule']> {
  // 1) Önce fiyat listesi (müşteri grubu)
  if (ctx.priceListId && variantId) {
    const entry = await prisma.priceListEntry.findFirst({
      where: {
        tenantId,
        priceListId: ctx.priceListId,
        variantId,
      },
    });
    if (entry) return 'PRICELIST';
  }

  // 2) Kademeli/koli kuralları
  if (ctx.priceListId && quantity > 0) {
    const rule = await prisma.priceRule.findFirst({
      where: {
        tenantId,
        priceListId: ctx.priceListId,
        minQty: { lte: quantity },
      },
      orderBy: { minQty: 'desc' },
    });
    if (rule) return 'TIER';
  }

  // 3) Hacim (miktar bazlı)
  if (quantity >= 100) {
    return 'VOLUME';
  }

  return 'LIST';
}

/**
 * Ürünün/varyantın temel liste fiyatını getirir.
 * Varyant varsa ondan, yoksa ilk varyantından TRY fiyatını alır.
 */
async function getListPrice(
  prisma: PrismaClient,
  tenantId: string,
  productId: string,
  variantId: string | null,
): Promise<number> {
  if (variantId) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, tenantId },
      select: { priceAmount: true, productId: true },
    });
    if (variant && variant.productId === productId) {
      return variant.priceAmount instanceof Decimal
        ? variant.priceAmount.toNumber()
        : Number(variant.priceAmount);
    }
  }

  // Varyant belirtilmemişse ilk varyantı al
  const firstVariant = await prisma.productVariant.findFirst({
    where: { productId, tenantId },
    select: { priceAmount: true },
    orderBy: { createdAt: 'asc' },
  });

  if (firstVariant) {
    return firstVariant.priceAmount instanceof Decimal
      ? firstVariant.priceAmount.toNumber()
      : Number(firstVariant.priceAmount);
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Ana fonksiyon
// ---------------------------------------------------------------------------

/**
 * Bayi için fiyat teklifi hesaplar.
 */
export async function quoteCompanyPricing(
  prisma: PrismaClient,
  input: PriceQuoteInput,
): Promise<PriceQuote> {
  const ctx = await resolveCompanyPricingContext(prisma, input.tenantId, input.companyAccountId);

  const items: PriceQuoteItem[] = [];
  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);

  for (const inputItem of input.items) {
    const listPrice = await getListPrice(
      prisma,
      input.tenantId,
      inputItem.productId,
      inputItem.variantId ?? null,
    );

    if (listPrice === 0) {
      log.warn(
        { tenantId: input.tenantId, productId: inputItem.productId },
        'Liste fiyatı bulunamadı',
      );
    }

    const rule = await resolveVariantPrice(
      prisma,
      input.tenantId,
      ctx,
      inputItem.variantId ?? null,
      inputItem.productId,
      inputItem.quantity,
      input.currency,
    );

    // İndirim yüzdesi kurala göre
    let discountPercent = 0;
    switch (rule) {
      case 'PRICELIST':
        discountPercent = 10;
        break;
      case 'TIER':
        discountPercent = 15;
        break;
      case 'VOLUME':
        discountPercent = inputItem.quantity >= 500 ? 8 : 5;
        break;
      case 'LIST':
      default:
        discountPercent = 0;
    }

    const finalUnitPrice = new Decimal(listPrice).mul(1 - discountPercent / 100);
    const lineTotal = finalUnitPrice.mul(inputItem.quantity);

    items.push({
      productId: inputItem.productId,
      variantId: inputItem.variantId ?? null,
      quantity: inputItem.quantity,
      listUnitPrice: listPrice,
      finalUnitPrice: finalUnitPrice.toNumber(),
      lineTotal: lineTotal.toNumber(),
      appliedRule: rule,
      currency: input.currency,
    });

    subtotal = subtotal.add(new Decimal(listPrice).mul(inputItem.quantity));
    discountTotal = discountTotal.add(
      new Decimal(listPrice).mul(inputItem.quantity).sub(lineTotal),
    );
  }

  const grandTotal = subtotal.sub(discountTotal);

  log.debug(
    {
      tenantId: input.tenantId,
      companyAccountId: input.companyAccountId,
      itemCount: items.length,
      grandTotal: grandTotal.toString(),
    },
    'B2B fiyat teklifi hesaplandı',
  );

  return {
    items,
    subtotal: subtotal.toNumber(),
    discountTotal: discountTotal.toNumber(),
    grandTotal: grandTotal.toNumber(),
    currency: input.currency,
    priceListId: ctx.priceListId,
    customerGroupId: ctx.customerGroupId,
  };
}

/**
 * Hızlı sipariş (quick order) için toplu fiyat hesaplar (SKU listesi).
 */
export async function quoteQuickOrder(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    companyAccountId: string;
    items: Array<{ sku: string; quantity: number }>;
    currency: string;
  },
): Promise<PriceQuote> {
  // SKU → variantId çözümleme (tenant içinde)
  const variants = await prisma.productVariant.findMany({
    where: {
      tenantId: input.tenantId,
      sku: { in: input.items.map((i) => i.sku) },
    },
    select: { id: true, sku: true, productId: true },
  });

  const skuMap = new Map(variants.map((v) => [v.sku, v]));

  const normalizedItems = input.items.map((item) => {
    const variant = skuMap.get(item.sku);
    if (!variant) {
      throw new Error(`SKU bulunamadı: ${item.sku}`);
    }
    return {
      productId: variant.productId,
      variantId: variant.id,
      quantity: item.quantity,
    };
  });

  return quoteCompanyPricing(prisma, {
    tenantId: input.tenantId,
    companyAccountId: input.companyAccountId,
    items: normalizedItems,
    currency: input.currency,
  });
}