/**
 * Müşteri Paneli servisi — Faz 7.
 *
 * Müşterinin kendi verilerini gördüğü ve yönettiği endpoint'ler için
 * iş mantığı. KVKK uyumlu: yalnızca oturum açmış müşterinin kendi
 * verilerine erişim sağlar.
 *
 * Endpoint'ler:
 *  - GET  /api/store/customer/me           — profil özeti
 *  - GET  /api/store/customer/orders       — siparişlerim
 *  - GET  /api/store/customer/addresses     — adres defteri
 *  - POST /api/store/customer/addresses     — yeni adres
 *  - GET  /api/store/customer/invoices      — faturalarım
 *  - GET  /api/store/customer/wishlist      — favorilerim
 *  - POST /api/store/customer/data-export   — KVKK veri ihracı talebi
 *  - POST /api/store/customer/delete        — KVKK veri silme talebi
 */

import { PrismaClient } from '@prisma/client';

import { createLogger } from '@eticart/config';
const log = createLogger({ service: 'customer-panel/customer-panel-service' });

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface CustomerProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  createdAt: Date;
  /** Toplam sipariş sayısı. */
  totalOrders: number;
  /** Açık sipariş sayısı. */
  openOrders: number;
  /** Toplam harcama (TRY). */
  totalSpent: number;
}

// ---------------------------------------------------------------------------
// Fonksiyonlar
// ---------------------------------------------------------------------------

/**
 * Müşteri profil özetini getirir (kendi verisi).
 */
export async function getCustomerProfile(
  prisma: PrismaClient,
  tenantId: string,
  customerId: string,
): Promise<CustomerProfile | null> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      createdAt: true,
    },
  });

  if (!customer) return null;

  const [totalOrders, openOrders, paidSum] = await Promise.all([
    prisma.order.count({ where: { tenantId, customerId } }),
    prisma.order.count({
      where: {
        tenantId,
        customerId,
        status: {
          in: ['pending_payment', 'awaiting_payment', 'confirmed', 'preparing', 'shipped'] as any,
        },
      },
    }),
    prisma.order.aggregate({
      where: { tenantId, customerId, paymentStatus: 'paid' as any },
      _sum: { grandTotal: true },
    }),
  ]);

  const [firstName = '', ...rest] = (customer.fullName ?? '').split(' ');
  const lastName = rest.join(' ');

  return {
    id: customer.id,
    email: customer.email,
    firstName,
    lastName,
    phone: customer.phone,
    createdAt: customer.createdAt,
    totalOrders,
    openOrders,
    totalSpent: Number((paidSum as any)?._sum?.grandTotal?.toString?.() ?? '0'),
  };
}

/**
 * Müşterinin kendi adres defterini getirir.
 */
export async function listCustomerAddresses(
  prisma: PrismaClient,
  tenantId: string,
  customerId: string,
) {
  return prisma.customerAddress.findMany({
    where: { tenantId, customerId },
    orderBy: [{ isDefaultShipping: 'desc' }, { createdAt: 'desc' }],
  });
}

/**
 * Müşteriye yeni adres ekler (ilk adres ise otomatik default yapılır).
 */
export async function addCustomerAddress(
  prisma: PrismaClient,
  tenantId: string,
  customerId: string,
  data: {
    fullName: string;
    phone: string;
    city: string;
    district?: string;
    addressLine1: string;
    addressLine2?: string;
    postalCode?: string;
    country?: string;
    isDefault?: boolean;
    kind?: 'SHIPPING' | 'BILLING' | 'BOTH';
  },
) {
  // İlk adres mi kontrol et
  const existingCount = await prisma.customerAddress.count({
    where: { tenantId, customerId },
  });

  return prisma.customerAddress.create({
    data: {
      tenantId,
      customerId,
      ...data,
      country: data.country ?? 'TR',
      isDefaultShipping: data.isDefault ?? existingCount === 0,
      isDefaultBilling: data.isDefault ?? existingCount === 0,
      kind: (data.kind ?? 'shipping').toLowerCase() as any,
    },
  });
}

/**
 * KVKK — Müşteri veri ihraç talebi oluşturur (GDPR/KVKK Madde 11).
 *
 * Not: Hassas alanlar (şifre hash, ödeme token) JSON'a dahil edilmez.
 */
export async function requestDataExport(
  prisma: PrismaClient,
  tenantId: string,
  customerId: string,
  _requesterIp?: string,
): Promise<{ requestId: string; estimatedReadyAt: Date }> {
  const req = await prisma.customerDataExportRequest.create({
    data: {
      tenantId,
      customerId,
      status: 'pending',
      
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    select: { id: true, expiresAt: true },
  });

  log.info(
    { tenantId, customerId, requestId: req.id },
    'KVKK veri ihraç talebi oluşturuldu',
  );

  return {
    requestId: req.id,
    estimatedReadyAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}

/**
 * KVKK — Müşteri hesap silme talebi (anonimleştirme tetiklenir).
 *
 * 30 günlük bekleme süresi uygulanır; sipariş/fatura kayıtları yasal zorunluluk
 * nedeniyle tutulur ancak kişisel veri anonimleştirilir.
 */
export async function requestAccountDeletion(
  prisma: PrismaClient,
  tenantId: string,
  customerId: string,
  _requesterIp?: string,
): Promise<{ requestId: string; deletionScheduledAt: Date }> {
  const deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const req = await prisma.customerDeletionRequest.create({
    data: {
      tenantId,
      customerId,
      status: 'pending',
      
      scheduledFor: deletionDate,
    },
    select: { id: true },
  });

  log.info(
    { tenantId, customerId, requestId: req.id, deletionDate },
    'KVKK hesap silme talebi oluşturuldu',
  );

  return { requestId: req.id, deletionScheduledAt: deletionDate };
}