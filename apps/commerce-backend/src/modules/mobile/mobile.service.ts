/**
 * Mobile Service — Push Notification + Mobile Dashboard.
 *
 * Faz 24: Mobile app için backend endpoint'leri.
 * - Dashboard summary
 * - Order listesi (mobil-optimized)
 * - Order detail
 * - Push token register/unregister
 * - Push notification gönder (order_created, low_stock)
 */
import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Pool } from 'pg';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { LOGGER_TOKEN } from '../../common/logger.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface MobileOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
  status: string;
  itemCount: number;
  createdAt: string;
}

interface MobileProduct {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
  status: 'active' | 'low_stock' | 'out_of_stock';
}

interface DashboardSummary {
  today: { revenue: number; orders: number; customers: number };
  yesterday: { revenue: number; orders: number };
  monthToDate: { revenue: number; orders: number };
  pendingOrders: number;
  lowStockProducts: number;
  recentOrders: MobileOrder[];
}

interface PushToken {
  id: string;
  tenantId: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  enabled: boolean;
  lastUsedAt: string;
  createdAt: string;
}

@Injectable()
export class MobileService implements OnApplicationBootstrap {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.info('Mobile service başlatıldı (push notification aktif)');
  }

  // ─────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string): Promise<DashboardSummary> {
    // Parallel queries
    const [today, yesterday, mtd, pending, lowStock, recent] = await Promise.all([
      this.pool.query<{ revenue: string; orders: string; customers: string }>(
        `SELECT
           COALESCE(SUM(total), 0) AS revenue,
           COUNT(*) AS orders,
           COUNT(DISTINCT customer_email) AS customers
         FROM public.orders
         WHERE tenant_id = $1
           AND created_at >= date_trunc('day', now())
           AND status != 'cancelled'`,
        [tenantId],
      ),
      this.pool.query<{ revenue: string; orders: string }>(
        `SELECT
           COALESCE(SUM(total), 0) AS revenue,
           COUNT(*) AS orders
         FROM public.orders
         WHERE tenant_id = $1
           AND created_at >= date_trunc('day', now() - interval '1 day')
           AND created_at < date_trunc('day', now())
           AND status != 'cancelled'`,
        [tenantId],
      ),
      this.pool.query<{ revenue: string; orders: string }>(
        `SELECT
           COALESCE(SUM(total), 0) AS revenue,
           COUNT(*) AS orders
         FROM public.orders
         WHERE tenant_id = $1
           AND created_at >= date_trunc('month', now())
           AND status != 'cancelled'`,
        [tenantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM public.orders
         WHERE tenant_id = $1 AND status IN ('pending', 'confirmed', 'preparing')`,
        [tenantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM public.products
         WHERE tenant_id = $1 AND stock <= low_stock_threshold AND stock > 0`,
        [tenantId],
      ),
      this.pool.query<MobileOrder>(
        `SELECT id, order_number AS "orderNumber", customer_name AS "customerName",
                total, status, item_count AS "itemCount", created_at AS "createdAt"
         FROM public.orders
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [tenantId],
      ),
    ]);

    return {
      today: {
        revenue: parseFloat(today.rows[0]?.revenue ?? '0'),
        orders: parseInt(today.rows[0]?.orders ?? '0', 10),
        customers: parseInt(today.rows[0]?.customers ?? '0', 10),
      },
      yesterday: {
        revenue: parseFloat(yesterday.rows[0]?.revenue ?? '0'),
        orders: parseInt(yesterday.rows[0]?.orders ?? '0', 10),
      },
      monthToDate: {
        revenue: parseFloat(mtd.rows[0]?.revenue ?? '0'),
        orders: parseInt(mtd.rows[0]?.orders ?? '0', 10),
      },
      pendingOrders: parseInt(pending.rows[0]?.count ?? '0', 10),
      lowStockProducts: parseInt(lowStock.rows[0]?.count ?? '0', 10),
      recentOrders: recent.rows,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // ORDERS
  // ─────────────────────────────────────────────────────────────

  async listOrders(
    tenantId: string,
    status?: string,
    limit = 50,
  ): Promise<MobileOrder[]> {
    const params: unknown[] = [tenantId, limit];
    let where = 'WHERE tenant_id = $1';
    if (status) {
      params.splice(1, 0, status);
      where += ` AND status = $${params.length - 1}`;
    }
    const r = await this.pool.query<MobileOrder>(
      `SELECT id, order_number AS "orderNumber", customer_name AS "customerName",
              total, status, item_count AS "itemCount", created_at AS "createdAt"
       FROM public.orders
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return r.rows;
  }

  async getOrderDetail(tenantId: string, orderId: string): Promise<unknown> {
    const r = await this.pool.query(
      `SELECT o.*, json_agg(json_build_object(
                'id', oi.id, 'productName', oi.product_name,
                'quantity', oi.quantity, 'price', oi.price
              )) AS items
       FROM public.orders o
       LEFT JOIN public.order_items oi ON oi.order_id = o.id
       WHERE o.tenant_id = $1 AND o.id = $2
       GROUP BY o.id`,
      [tenantId, orderId],
    );
    if (r.rows.length === 0) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Sipariş bulunamadı.');
    }
    return r.rows[0];
  }

  async updateOrderStatus(
    tenantId: string,
    orderId: string,
    status: string,
    note?: string,
  ): Promise<{ ok: boolean }> {
    const r = await this.pool.query(
      `UPDATE public.orders
       SET status = $3,
           notes = COALESCE($4, notes),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, orderId, status, note],
    );
    if ((r.rowCount ?? 0) === 0) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Sipariş bulunamadı.');
    }
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────
  // PRODUCTS
  // ─────────────────────────────────────────────────────────────

  async listProducts(
    tenantId: string,
    filter?: { lowStock?: boolean },
    limit = 100,
  ): Promise<MobileProduct[]> {
    let where = 'WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (filter?.lowStock) {
      where += ' AND stock <= low_stock_threshold';
    }
    params.push(limit);
    const r = await this.pool.query<MobileProduct>(
      `SELECT id, name, sku, stock, price,
              CASE
                WHEN stock = 0 THEN 'out_of_stock'
                WHEN stock <= low_stock_threshold THEN 'low_stock'
                ELSE 'active'
              END AS status
       FROM public.products
       ${where}
       ORDER BY name
       LIMIT $${params.length}`,
      params,
    );
    return r.rows;
  }

  async updateStock(
    tenantId: string,
    productId: string,
    stock: number,
  ): Promise<{ ok: boolean }> {
    if (stock < 0) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Stok negatif olamaz.');
    }
    const r = await this.pool.query(
      `UPDATE public.products
       SET stock = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, productId, stock],
    );
    if ((r.rowCount ?? 0) === 0) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ürün bulunamadı.');
    }
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────
  // PUSH NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────

  async registerPushToken(
    tenantId: string,
    userId: string,
    token: string,
    platform: 'ios' | 'android',
  ): Promise<{ ok: boolean }> {
    await this.pool.query(
      `INSERT INTO public.mobile_push_tokens (
         tenant_id, user_id, token, platform, enabled, last_used_at
       ) VALUES ($1, $2, $3, $4, true, now())
       ON CONFLICT (tenant_id, token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             enabled = true,
             last_used_at = now()`,
      [tenantId, userId, token, platform],
    );
    return { ok: true };
  }

  async unregisterPushToken(tenantId: string, token: string): Promise<{ ok: boolean }> {
    await this.pool.query(
      `UPDATE public.mobile_push_tokens
       SET enabled = false
       WHERE tenant_id = $1 AND token = $2`,
      [tenantId, token],
    );
    return { ok: true };
  }

  /**
   * Tenant'taki tüm aktif kullanıcılara push gönder.
   */
  async sendPushToTenant(
    tenantId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<{ sent: number; failed: number }> {
    const r = await this.pool.query<{ token: string }>(
      `SELECT token FROM public.mobile_push_tokens
       WHERE tenant_id = $1 AND enabled = true
         AND last_used_at > now() - interval '90 days'`,
      [tenantId],
    );
    if (r.rows.length === 0) return { sent: 0, failed: 0 };

    const messages = r.rows.map((row) => ({
      to: row.token,
      sound: 'default',
      title,
      body,
      data: data ?? {},
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.logger.warn({ status: res.status }, 'Expo push API hatası');
        return { sent: 0, failed: messages.length };
      }
      const result = (await res.json()) as { data?: Array<{ status?: string }> };
      const sent = result.data?.filter((d) => d.status === 'ok').length ?? messages.length;
      const failed = messages.length - sent;
      return { sent, failed };
    } catch (err) {
      this.logger.error(
        { err: (err as Error).message },
        'Push notification gönderimi başarısız',
      );
      return { sent: 0, failed: messages.length };
    }
  }

  /**
   * Sipariş oluşturulduğunda tetikle (sipariş sahibi store owner'a).
   */
  async notifyOrderCreated(tenantId: string, orderId: string, orderNumber: string): Promise<void> {
    await this.sendPushToTenant(
      tenantId,
      '🛒 Yeni Sipariş',
      `#${orderNumber} numaralı sipariş alındı`,
      { type: 'order.created', orderId },
    );
  }

  /**
   * Düşük stok uyarısı.
   */
  async notifyLowStock(
    tenantId: string,
    productName: string,
    stock: number,
  ): Promise<void> {
    await this.sendPushToTenant(
      tenantId,
      '⚠️ Düşük Stok',
      `${productName}: ${stock} adet kaldı`,
      { type: 'product.low_stock' },
    );
  }
}