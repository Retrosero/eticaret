/**
 * Sipariş (Order) servisi — Faz 7.
 *
 * Sorumluluklar:
 *  - Sipariş listeleme (admin + müşteri görünümleri, tenant-scoped)
 *  - Sipariş durumu geçişleri (status machine)
 *  - İade (refund) başlatma
 *  - İade → fatura iptali bağlantısı
 *  - Tenant izolasyonu
 *
 * Para alanları string-decimal olarak tutulur (float YASAK).
 */

import { PrismaClient, OrderStatus, PaymentStatus } from '@prisma/client';

import { createLogger } from '@eticart/config';
const log = createLogger({ service: 'order/order-service' });
import { Decimal } from '@prisma/client/runtime/library';

// ---------------------------------------------------------------------------
// Durum makinesi (Status Machine)
// ---------------------------------------------------------------------------

/** İzin verilen sipariş durumu geçişleri. */
const ALLOWED_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  pending_payment: ['awaiting_payment', 'paid', 'cancelled'],
  awaiting_payment: ['confirmed', 'cancelled', 'failed'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  partially_shipped: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned', 'closed'],
  returned: ['refunded'],
  refunded: ['closed'],
  cancelled: ['closed'],
  failed: ['closed'],
  closed: [],
} as const;

/** Durum geçişi izinli mi? */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  const map = ALLOWED_TRANSITIONS as unknown as Record<string, readonly OrderStatus[]>;
  const list = map[from];
  return list?.includes(to) ?? false;
}

/** Tenant'a özel override varsa kullan, yoksa varsayılan. */
async function resolveTransitionAllowed(
  prisma: PrismaClient,
  tenantId: string,
  from: OrderStatus,
  to: OrderStatus,
): Promise<boolean> {
  const override = await prisma.orderStatusMachineRule.findUnique({
    where: { tenantId_fromStatus_toStatus: { tenantId, fromStatus: from, toStatus: to } },
  });
  if (override) return override.allowed;
  return canTransition(from, to);
}

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface ListOrdersInput {
  tenantId: string;
  customerId?: string | null;
  status?: OrderStatus[];
  search?: string | null;
  page?: number;
  pageSize?: number;
  sort?: 'createdAt' | 'grandTotal' | 'orderNumber';
  order?: 'asc' | 'desc';
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  customerId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  grandTotal: number;
  currency: string;
  itemCount: number;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Fonksiyonlar
// ---------------------------------------------------------------------------

/**
 * Siparişleri listeler (admin veya müşteri görünümü).
 */
export async function listOrders(
  prisma: PrismaClient,
  input: ListOrdersInput,
): Promise<{ items: OrderSummary[]; total: number }> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where: any = {
    tenantId: input.tenantId,
  };
  if (input.customerId) where.customerId = input.customerId;
  if (input.status && input.status.length > 0) where.status = { in: input.status };
  if (input.search) {
    where.OR = [
      { orderNumber: { contains: input.search, mode: 'insensitive' } },
      { customer: { email: { contains: input.search, mode: 'insensitive' } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [input.sort ?? 'createdAt']: input.order ?? 'desc' },
      include: {
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const items: OrderSummary[] = rows.map((r: any) => ({
    id: r.id,
    orderNumber: r.orderNumber,
    customerId: r.customerId,
    status: r.status,
    paymentStatus: r.paymentStatus,
    grandTotal: Number(r.grandTotal.toString()),
    currency: r.currency,
    itemCount: r._count.items,
    createdAt: r.createdAt,
  }));

  return { items, total };
}

/**
 * Sipariş detayını getirir (kalemler, adresler, fatura ile birlikte).
 */
export async function getOrderDetail(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
): Promise<any | null> {
  return prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: {
      items: true,
      customer: { select: { id: true, email: true, fullName: true, phone: true } },
      shippingAddress: true,
      billingAddress: true,
      invoices: true,
      history: { orderBy: { createdAt: 'desc' } },
      notes: { orderBy: { createdAt: 'desc' } },
    },
  });
}

/**
 * Sipariş durumunu değiştirir (status machine kontrolü ile).
 *
 * @returns Güncellenmiş sipariş veya hata.
 */
export async function transitionOrderStatus(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
  toStatus: OrderStatus,
  actorUserId: string,
  reason?: string,
): Promise<{ id: string; status: OrderStatus }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: { id: true, status: true },
  });

  if (!order) {
    throw new Error('Sipariş bulunamadı');
  }

  const allowed = await resolveTransitionAllowed(prisma, tenantId, order.status, toStatus);
  if (!allowed) {
    throw new Error(`Geçersiz durum geçişi: ${order.status} → ${toStatus}`);
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: toStatus },
    }),
    prisma.orderStatusHistory.create({
      data: {
        tenantId,
        orderId,
        fromStatus: order.status,
        toStatus,
        actorId: actorUserId,
        note: reason ?? null,
      },
    }),
  ]);

  log.info(
    { tenantId, orderId, from: order.status, to: toStatus, actorUserId },
    'Sipariş durumu değiştirildi',
  );

  return { id: orderId, status: toStatus };
}

/**
 * Siparişi iptal eder (iptal edilebilir bir durumda ise).
 */
export async function cancelOrder(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
  actorUserId: string,
  reason?: string,
): Promise<void> {
  await transitionOrderStatus(prisma, tenantId, orderId, 'cancelled', actorUserId, reason);
}

/**
 * İade başlatır (status'u RETURNED yapar, ödeme iadesi ayrıca çağrılır).
 */
export async function startReturn(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
  actorUserId: string,
  reason?: string,
): Promise<void> {
  await transitionOrderStatus(prisma, tenantId, orderId, 'returned', actorUserId, reason);

  // Varsa faturayı iptal et
  await prisma.orderInvoice.updateMany({
    where: { orderId, tenantId, status: 'issued' as any },
    data: { status: 'cancelled' as any },
  });
}

/**
 * İade tutarını hesaplar (decimal olarak).
 */
export async function calculateRefundAmount(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
): Promise<number> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: { grandTotal: true, refundedAmount: true },
  });
  if (!order) throw new Error('Sipariş bulunamadı');

  const grand = new Decimal(order.grandTotal.toString());
  const alreadyRefunded = new Decimal(order.refundedAmount?.toString() ?? '0');
  return grand.sub(alreadyRefunded).toNumber();
}

/**
 * Müşteri paneli özeti (son siparişler, açık siparişler, toplam harcama).
 */
export async function getCustomerPanelSummary(
  prisma: PrismaClient,
  tenantId: string,
  customerId: string,
): Promise<{
  openOrdersCount: number;
  totalOrders: number;
  totalSpent: number;
  recentOrders: OrderSummary[];
}> {
  const [openOrdersCount, totalOrders, aggregate, recent] = await Promise.all([
    prisma.order.count({
      where: {
        tenantId,
        customerId,
        status: { in: ['pending_payment', 'awaiting_payment', 'confirmed', 'preparing', 'shipped'] as any },
      },
    }),
    prisma.order.count({ where: { tenantId, customerId } }),
    prisma.order.aggregate({
      where: { tenantId, customerId, paymentStatus: 'paid' as any },
      _sum: { grandTotal: true },
    }),
    prisma.order.findMany({
      where: { tenantId, customerId },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    }),
  ]);

  return {
    openOrdersCount,
    totalOrders,
    totalSpent: Number(aggregate._sum.grandTotal?.toString() ?? '0'),
    recentOrders: recent.map((r: any) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      customerId: r.customerId,
      status: r.status,
      paymentStatus: r.paymentStatus,
      grandTotal: Number(r.grandTotal.toString()),
      currency: r.currency,
      itemCount: r._count.items,
      createdAt: r.createdAt,
    })),
  };
}