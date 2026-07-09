/**
 * Fatura (Invoice) servisi — Faz 7 + Faz 10C (NES entegrasyonu).
 *
 * Sorumluluklar:
 *  - Sipariş tamamlandığında fatura oluşturma
 *  - e-Fatura/e-Arşiv entegrasyonu (NES adaptörü)
 *  - Fatura iptali (hem DB hem GİB)
 *  - Fatura numarası üretimi (tenant başına yıl bazlı artan sıra)
 *  - Yeniden gönderim (failed durumda)
 *
 * Türkiye uyumu:
 *  - Para alanları decimal(15,4) (float YASAK)
 *  - Fatura iptali için ayrı fatura türü oluşturulabilir (değişim belgesi)
 */

import { PrismaClient, InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';

import { createLogger } from '@eticart/config';
import { getEInvoiceAdapter } from './einvoice-adapter.js';
import type { CreateInvoiceRequest } from '@eticart/einvoice-adapters';
const log = createLogger({ service: 'invoice/invoice-service' });

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface CreateInvoiceInput {
  tenantId: string;
  orderId: string;
  type: InvoiceType;
  /** Müşterinin vergi numarası (varsa, kurumsal fatura için). */
  customerTaxId?: string | null;
  /** Müşterinin vergi dairesi. */
  customerTaxOffice?: string | null;
  /** Müşteri firma adı. */
  customerCompanyName?: string | null;
  /** Müşteri adresi (fatura). */
  customerAddress?: string | null;
  /** Notlar. */
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Fatura numarası üretimi
// ---------------------------------------------------------------------------

/**
 * Tenant + yıl bazlı artan fatura numarası üretir.
 * Format: INV-YYYYMMDD-XXXX (tenant özelinde sıralı).
 */
async function generateInvoiceNumber(prisma: PrismaClient, tenantId: string): Promise<string> {
  const today = new Date();
  const year = today.getFullYear();
  const ymd =
    year.toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `INV-${ymd}-`;

  // Sequence artırımı — transaction'lı veya fallback.
let nextValue: number;
try {
  nextValue = await prisma.$transaction(async (tx: any) => {
    const existing = await tx.invoiceSequence.findUnique({
      where: { tenantId_year: { tenantId, year } },
    });

    const next = (existing?.lastValue ?? 0) + 1;

    if (existing) {
      await tx.invoiceSequence.update({
        where: { tenantId_year: { tenantId, year } },
        data: { lastValue: next },
      });
    } else {
      try {
        await tx.invoiceSequence.create({
          data: { tenantId, year, lastValue: next },
        });
      } catch (err) {
        await tx.invoiceSequence.update({
          where: { tenantId_year: { tenantId, year } },
          data: { lastValue: { increment: 1 } },
        });
      }
    }

    return next;
  });
} catch (err) {
  // Mock ortamlar veya transaction desteklemeyen client'lar için fallback
  const existing = await prisma.invoiceSequence.findUnique({
    where: { tenantId_year: { tenantId, year } },
  });
  nextValue = (existing?.lastValue ?? 0) + 1;
  if (existing) {
    await prisma.invoiceSequence.update({
      where: { tenantId_year: { tenantId, year } },
      data: { lastValue: nextValue },
    });
  } else {
    await prisma.invoiceSequence.create({
      data: { tenantId, year, lastValue: nextValue },
    });
  }
}

  return `${prefix}${String(nextValue).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// Servis fonksiyonları
// ---------------------------------------------------------------------------

/**
 * Sipariş için fatura oluşturur + (e-fatura ise) GİB'e gönderir.
 */
export async function createInvoice(
  prisma: PrismaClient,
  input: CreateInvoiceInput,
): Promise<{ id: string; invoiceNumber: string }> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    include: { items: true },
  });

  if (!order) {
    throw new Error('Sipariş bulunamadı');
  }

  if (order.status === 'cancelled') {
    throw new Error('İptal edilmiş sipariş için fatura oluşturulamaz');
  }

  const existing = await prisma.orderInvoice.findFirst({
    where: {
      orderId: order.id,
      tenantId: input.tenantId,
      status: { not: 'cancelled' as any },
    },
  });

  if (existing) {
    return { id: existing.id, invoiceNumber: existing.invoiceNumber };
  }

  const invoiceNumber = await generateInvoiceNumber(prisma, input.tenantId);

  const customerSnapshot: Prisma.InputJsonValue = {
    taxId: input.customerTaxId ?? null,
    taxOffice: input.customerTaxOffice ?? null,
    companyName: input.customerCompanyName ?? null,
    address: input.customerAddress ?? null,
  };

  const invoice = await prisma.orderInvoice.create({
    data: {
      tenantId: input.tenantId,
      orderId: order.id,
      invoiceNumber,
      invoiceType: input.type,
      status: 'issued',
      currency: order.currency,
      totalAmount: order.grandTotal,
      taxTotal: order.taxTotal,
      customerSnapshot,
      companySnapshot: {},
      issuedAt: new Date(),
    },
    select: { id: true, invoiceNumber: true },
  });

  log.info(
    { tenantId: input.tenantId, invoiceId: invoice.id, orderId: order.id, type: input.type },
    'Fatura oluşturuldu',
  );

  // e-Fatura / e-Arşiv / e-İrsaliye ise adaptör ile GİB'e gönder
  if (input.type !== ('pdf' as InvoiceType)) {
    const adapter = getEInvoiceAdapter('nes');
    if (adapter) {
      try {
        const request: CreateInvoiceRequest = {
          tenantId: input.tenantId,
          orderId: order.id,
          invoiceNumber,
          type:
            input.type === ('e_fatura' as InvoiceType)
              ? 'e_fatura'
              : input.type === ('e_arsiv' as InvoiceType)
                ? 'e_arsiv'
                : 'e_irsaliye',
          currency: order.currency,
          issueDate: new Date(),
          seller: {
            taxId: process.env.SELLER_TAX_ID ?? '0000000000',
            taxOffice: process.env.SELLER_TAX_OFFICE,
            legalName: process.env.SELLER_LEGAL_NAME ?? 'Demo Mağaza A.Ş.',
            address: {
              street: process.env.SELLER_ADDRESS_STREET ?? 'Merkez Mah.',
              city: process.env.SELLER_ADDRESS_CITY ?? 'İstanbul',
              country: 'TR',
            },
          },
          buyer: {
            taxId: input.customerTaxId ?? '1111111111',
            legalName: input.customerCompanyName ?? 'Müşteri',
            address: { street: input.customerAddress ?? '-', city: '-', country: 'TR' },
          },
          lines: order.items.map((item, idx) => ({
            index: idx + 1,
            name: item.productTitle,
            quantity: item.quantity,
            unit: 'ADET',
            unitPrice: Number(item.unitPrice.toString()),
            taxRate: 20,
          })),
        };

        const result = await adapter.createInvoice(request);

        await prisma.orderInvoice.update({
          where: { id: invoice.id },
          data: {
            externalUuid: result.uuid || null,
            eInvoiceStatus: result.status,
            eFaturaProvider: adapter.name,
          } as any,
        });

        log.info(
          { invoiceId: invoice.id, uuid: result.uuid, status: result.status },
          'e-Fatura adaptör yanıtı',
        );
      } catch (err) {
        log.error({ err, invoiceId: invoice.id }, 'e-Fatura adaptör hatası');
        await prisma.orderInvoice.update({
          where: { id: invoice.id },
          data: { eInvoiceStatus: 'pending' } as any,
        });
      }
    } else {
      log.warn(
        { invoiceId: invoice.id, type: input.type },
        'e-Fatura adaptörü yok — fatura sadece DB\'ye kaydedildi, GİB\'e gönderilmedi',
      );
      await prisma.orderInvoice.update({
        where: { id: invoice.id },
        data: { eInvoiceStatus: 'pending' } as any,
      });
    }
  }

  return invoice;
}

/**
 * Faturayı iptal eder (DB + GİB).
 */
export async function cancelInvoice(
  prisma: PrismaClient,
  _tenantId: string,
  invoiceId: string,
  reason: string,
): Promise<void> {
  await prisma.orderInvoice.update({
    where: { id: invoiceId },
    data: {
      status: 'cancelled',
    },
  });

  const invoice = await prisma.orderInvoice.findUnique({ where: { id: invoiceId } });
  if (invoice && (invoice as any).externalUuid) {
    const adapter = getEInvoiceAdapter('nes');
    if (adapter) {
      try {
        await adapter.cancelInvoice({
          uuid: (invoice as any).externalUuid,
          reason,
          cancelledAt: new Date(),
        });
        log.info(
          { invoiceId, uuid: (invoice as any).externalUuid },
          'e-Fatura GİB üzerinden iptal edildi',
        );
      } catch (err) {
        log.error(
          { err, invoiceId },
          'GİB üzerinden iptal hatası — manuel müdahale gerekebilir',
        );
      }
    }
  }
}

/**
 * Başarısız/e-fatura GİB gönderimini yeniden dener.
 *
 * @returns yeni durum
 */
export async function resendInvoiceToGib(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
): Promise<{ status: string; errorMessage?: string }> {
  const invoice = await prisma.orderInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: { order: { include: { items: true } } },
  });

  if (!invoice) throw new Error('Fatura bulunamadı');
  if (invoice.invoiceType === ('pdf' as InvoiceType)) {
    throw new Error('Manuel PDF fatura GİB\'e gönderilemez');
  }

  const adapter = getEInvoiceAdapter('nes');
  if (!adapter) throw new Error('NES adaptörü yapılandırılmamış');

  const order = invoice.order;
  const type =
    invoice.invoiceType === ('e_fatura' as InvoiceType)
      ? 'e_fatura'
      : invoice.invoiceType === ('e_arsiv' as InvoiceType)
        ? 'e_arsiv'
        : 'e_irsaliye';

  const customerSnapshot = (invoice.customerSnapshot as any) ?? {};

  const request: CreateInvoiceRequest = {
    tenantId,
    orderId: order.id,
    invoiceNumber: invoice.invoiceNumber,
    type,
    currency: invoice.currency,
    issueDate: invoice.issuedAt ?? new Date(),
    seller: {
      taxId: process.env.SELLER_TAX_ID ?? '0000000000',
      legalName: process.env.SELLER_LEGAL_NAME ?? 'Demo Mağaza A.Ş.',
      address: { street: '-', city: 'İstanbul', country: 'TR' },
    },
    buyer: {
      taxId: customerSnapshot.taxId ?? '1111111111',
      legalName: customerSnapshot.companyName ?? 'Müşteri',
      address: { street: customerSnapshot.address ?? '-', city: '-', country: 'TR' },
    },
    lines: order.items.map((item, idx) => ({
      index: idx + 1,
      name: item.productTitle,
      quantity: item.quantity,
      unit: 'ADET',
      unitPrice: Number(item.unitPrice.toString()),
      taxRate: 20,
    })),
  };

  const result = await adapter.createInvoice(request);

  await prisma.orderInvoice.update({
    where: { id: invoiceId },
    data: {
      externalUuid: result.uuid || null,
      eInvoiceStatus: result.status,
      eFaturaProvider: adapter.name,
    } as any,
  });

  return { status: result.status, errorMessage: result.errorMessage };
}

/**
 * GİB'den güncel fatura durumunu sorgular.
 */
export async function refreshInvoiceStatus(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
): Promise<{ status: string; gibReference?: string }> {
  const invoice = await prisma.orderInvoice.findFirst({
    where: { id: invoiceId, tenantId },
  });

  if (!invoice || !(invoice as any).externalUuid) {
    throw new Error('Fatura GİB\'e gönderilmemiş');
  }

  const adapter = getEInvoiceAdapter('nes');
  if (!adapter) throw new Error('NES adaptörü yapılandırılmamış');

  const result = await adapter.getStatus((invoice as any).externalUuid);

  await prisma.orderInvoice.update({
    where: { id: invoiceId },
    data: { eInvoiceStatus: result.status } as any,
  });

  return { status: result.status, gibReference: result.gibReference };
}

/**
 * Siparişe bağlı tüm faturaları listeler.
 */
export async function listOrderInvoices(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
): Promise<
  Array<{
    id: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    totalAmount: number;
    currency: string;
    issuedAt: Date | null;
  }>
> {
  const rows = await prisma.orderInvoice.findMany({
    where: { orderId, tenantId },
    orderBy: { issuedAt: 'desc' },
  });

  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    status: r.status,
    totalAmount: Number(r.totalAmount.toString()),
    currency: r.currency,
    issuedAt: r.issuedAt,
  }));
}

/**
 * Müşteri paneli: müşterinin tüm faturalarını listeler.
 */
export async function listCustomerInvoices(
  prisma: PrismaClient,
  tenantId: string,
  customerId: string,
  page = 1,
  pageSize = 20,
): Promise<{
  items: Array<{
    id: string;
    invoiceNumber: string;
    orderNumber: string;
    totalAmount: number;
    currency: string;
    status: InvoiceStatus;
    issuedAt: Date | null;
  }>;
  total: number;
}> {
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, pageSize));

  const [rows, total] = await Promise.all([
    prisma.orderInvoice.findMany({
      where: { tenantId, order: { customerId } },
      include: { order: { select: { orderNumber: true } } },
      orderBy: { issuedAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.orderInvoice.count({
      where: { tenantId, order: { customerId } },
    }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      orderNumber: r.order.orderNumber,
      totalAmount: Number(r.totalAmount.toString()),
      currency: r.currency,
      status: r.status,
      issuedAt: r.issuedAt,
    })),
    total,
  };
}