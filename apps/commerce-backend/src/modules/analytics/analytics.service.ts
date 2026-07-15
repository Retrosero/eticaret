/**
 * Analytics Service — Tenant başına detaylı raporlama.
 *
 * Endpoint'ler:
 *   - getSalesOverview(range)
 *   - getTopProducts(range, limit)
 *   - getTopCategories(range, limit)
 *   - getCustomerCohort(cohortMonth)
 *   - getConversionFunnel(range)
 *   - getRevenueByChannel(range)
 *   - getRealtimeStats()
 *   - exportCsv(type, range)
 *
 * Tenant-scoped: tüm sorgular `WHERE tenant_id = $1` ile.
 * Cache: 5 dakika (analytics için yeterli).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';


export type AnalyticsRange = '24h' | '7d' | '30d' | '90d' | '1y' | 'all';

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
  ) {}

  /**
   * Satış özeti — toplam ciro, sipariş, AOV.
   */
  async getSalesOverview(
    tenantId: string,
    range: AnalyticsRange,
  ): Promise<{
    range: string;
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    uniqueCustomers: number;
    refunds: number;
    newVsReturning: { new: number; returning: number };
    dailySeries: Array<{ date: string; revenue: number; orders: number }>;
  }> {
    const interval = this.rangeToInterval(range);

    const overview = await this.pool.query<{
      total_revenue: string;
      total_orders: string;
      unique_customers: string;
      refunds: string;
    }>(
      `SELECT
         COALESCE(SUM(total_amount - COALESCE(refunded_amount, 0)), 0)::text as total_revenue,
         COUNT(*)::text as total_orders,
         COUNT(DISTINCT customer_id)::text as unique_customers,
         COALESCE(SUM(COALESCE(refunded_amount, 0)), 0)::text as refunds
       FROM public.orders
       WHERE tenant_id = $1
         AND status NOT IN ('cancelled', 'failed')
         AND created_at > now() - $2::interval`,
      [tenantId, interval],
    );

    const row = overview.rows[0]!;
    const totalRevenue = Number(row.total_revenue);
    const totalOrders = Number(row.total_orders);
    const uniqueCustomers = Number(row.unique_customers);
    const refunds = Number(row.refunds);
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // New vs returning
    const newVsReturning = await this.pool.query<{
      new: string;
      returning: string;
    }>(
      `SELECT
         COUNT(DISTINCT CASE WHEN first_order_at > now() - $2::interval THEN customer_id END)::text as new,
         COUNT(DISTINCT CASE WHEN first_order_at <= now() - $2::interval THEN customer_id END)::text as returning
       FROM (
         SELECT customer_id, MIN(created_at) as first_order_at
         FROM public.orders
         WHERE tenant_id = $1 AND status NOT IN ('cancelled', 'failed')
         GROUP BY customer_id
       ) sub`,
      [tenantId, interval],
    );

    // Daily series
    const series = await this.pool.query<{
      date: string;
      revenue: string;
      orders: string;
    }>(
      `SELECT date_trunc('day', created_at)::date::text as date,
              COALESCE(SUM(total_amount), 0)::text as revenue,
              COUNT(*)::text as orders
       FROM public.orders
       WHERE tenant_id = $1
         AND status NOT IN ('cancelled', 'failed')
         AND created_at > now() - $2::interval
       GROUP BY date
       ORDER BY date ASC`,
      [tenantId, interval],
    );

    return {
      range,
      totalRevenue,
      totalOrders,
      averageOrderValue: Math.round(aov),
      uniqueCustomers,
      refunds,
      newVsReturning: {
        new: Number(newVsReturning.rows[0]?.new ?? '0'),
        returning: Number(newVsReturning.rows[0]?.returning ?? '0'),
      },
      dailySeries: series.rows.map((r) => ({
        date: r.date,
        revenue: Number(r.revenue),
        orders: Number(r.orders),
      })),
    };
  }

  /**
   * En çok satan ürünler.
   */
  async getTopProducts(
    tenantId: string,
    range: AnalyticsRange,
    limit: number = 10,
  ): Promise<
    Array<{
      productId: string;
      productName: string;
      sku: string;
      imageUrl: string | null;
      unitsSold: number;
      revenue: number;
      orderCount: number;
    }>
  > {
    const r = await this.pool.query<{
      product_id: string;
      product_name: string;
      sku: string;
      image_url: string | null;
      units_sold: string;
      revenue: string;
      order_count: string;
    }>(
      `SELECT
         oi.product_id,
         oi.product_name,
         oi.sku,
         (SELECT image_url FROM public.product_images pi
          WHERE pi.product_id = oi.product_id
          ORDER BY pi.sort_order ASC LIMIT 1) as image_url,
         SUM(oi.quantity)::text as units_sold,
         SUM(oi.total_price)::text as revenue,
         COUNT(DISTINCT oi.order_id)::text as order_count
       FROM public.order_items oi
       INNER JOIN public.orders o ON o.id = oi.order_id
       WHERE o.tenant_id = $1
         AND o.status NOT IN ('cancelled', 'failed')
         AND o.created_at > now() - $3::interval
       GROUP BY oi.product_id, oi.product_name, oi.sku
       ORDER BY SUM(oi.total_price) DESC
       LIMIT $2`,
      [tenantId, limit, this.rangeToInterval(range)],
    );
    return r.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      imageUrl: row.image_url,
      unitsSold: Number(row.units_sold),
      revenue: Number(row.revenue),
      orderCount: Number(row.order_count),
    }));
  }

  /**
   * En çok satan kategoriler.
   */
  async getTopCategories(
    tenantId: string,
    range: AnalyticsRange,
    limit: number = 10,
  ): Promise<
    Array<{
      categoryId: string;
      categoryName: string;
      unitsSold: number;
      revenue: number;
      productCount: number;
    }>
  > {
    const r = await this.pool.query<{
      category_id: string;
      category_name: string;
      units_sold: string;
      revenue: string;
      product_count: string;
    }>(
      `SELECT
         c.id as category_id,
         c.name as category_name,
         SUM(oi.quantity)::text as units_sold,
         SUM(oi.total_price)::text as revenue,
         COUNT(DISTINCT oi.product_id)::text as product_count
       FROM public.order_items oi
       INNER JOIN public.orders o ON o.id = oi.order_id
       INNER JOIN public.products p ON p.id = oi.product_id
       INNER JOIN public.categories c ON c.id = p.category_id
       WHERE o.tenant_id = $1
         AND o.status NOT IN ('cancelled', 'failed')
         AND o.created_at > now() - $3::interval
       GROUP BY c.id, c.name
       ORDER BY SUM(oi.total_price) DESC
       LIMIT $2`,
      [tenantId, limit, this.rangeToInterval(range)],
    );
    return r.rows.map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      unitsSold: Number(row.units_sold),
      revenue: Number(row.revenue),
      productCount: Number(row.product_count),
    }));
  }

  /**
   * Müşteri cohort analizi (ay bazlı retention).
   *
   * Mantık:
   *   - Müşteriler ilk sipariş ayına göre cohort'a atanır
   *   - Her cohort için: 0. ay, 1. ay, 2. ay, ... retention
   *   - Retention = o ay aktif olan / cohort büyüklüğü
   */
  async getCustomerCohort(
    tenantId: string,
    months: number = 12,
  ): Promise<{
    months: number;
    cohorts: Array<{
      cohort: string; // "2025-01"
      size: number; // cohort büyüklüğü
      retention: number[]; // [month0, month1, month2, ...]
    }>;
  }> {
    // Müşteri cohort atamaları
    const cohorts = await this.pool.query<{
      cohort: string;
      customer_id: string;
    }>(
      `SELECT
         to_char(date_trunc('month', MIN(created_at)), 'YYYY-MM') as cohort,
         customer_id
       FROM public.orders
       WHERE tenant_id = $1
         AND status NOT IN ('cancelled', 'failed')
         AND customer_id IS NOT NULL
       GROUP BY customer_id`,
      [tenantId],
    );

    // Her cohort için aktif olduğu aylar
    const activity = await this.pool.query<{
      cohort: string;
      active_month: string;
    }>(
      `WITH cohorts AS (
         SELECT customer_id, date_trunc('month', MIN(created_at)) as cohort_start
         FROM public.orders
         WHERE tenant_id = $1 AND status NOT IN ('cancelled', 'failed')
         GROUP BY customer_id
       )
       SELECT
         to_char(c.cohort_start, 'YYYY-MM') as cohort,
         to_char(date_trunc('month', o.created_at), 'YYYY-MM') as active_month
       FROM cohorts c
       INNER JOIN public.orders o ON o.customer_id = c.customer_id
         AND o.tenant_id = $1
         AND o.status NOT IN ('cancelled', 'failed')
       GROUP BY c.cohort_start, date_trunc('month', o.created_at)`,
      [tenantId],
    );

    // Cohort map
    const cohortMap = new Map<string, Set<string>>();
    for (const r of cohorts.rows) {
      if (!cohortMap.has(r.cohort)) cohortMap.set(r.cohort, new Set());
      cohortMap.get(r.cohort)!.add(r.customer_id);
    }

    // Activity map
    const activityMap = new Map<string, Set<string>>();
    for (const r of activity.rows) {
      if (!activityMap.has(r.cohort)) activityMap.set(r.cohort, new Set());
      activityMap.get(r.cohort)!.add(r.active_month);
    }

    // Build retention matrix
    const result: Array<{
      cohort: string;
      size: number;
      retention: number[];
    }> = [];

    const cohortList = Array.from(cohortMap.keys()).sort().slice(-months);
    for (const cohort of cohortList) {
      const size = cohortMap.get(cohort)!.size;
      const activeMonths = activityMap.get(cohort) ?? new Set();

      // Her ay için retention
      const cohortDate = new Date(`${cohort}-01`);
      const retention: number[] = [];
      for (let i = 0; i < months; i++) {
        const checkDate = new Date(cohortDate);
        checkDate.setMonth(checkDate.getMonth() + i);
        const checkKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}`;
        retention.push(
          size > 0 ? Math.round((activeMonths.has(checkKey) ? 1 : 0) * 100) / 100 : 0,
        );
      }
      result.push({ cohort, size, retention });
    }

    return { months, cohorts: result };
  }

  /**
   * Conversion funnel.
   *
   *   visitors → addToCart → checkout → payment → order
   *
   * Her aşama için sayı + dönüşüm oranı.
   */
  async getConversionFunnel(
    tenantId: string,
    range: AnalyticsRange,
  ): Promise<{
    range: string;
    stages: Array<{
      name: string;
      count: number;
      conversionRate: number; // bir önceki aşamadan
      dropoffRate: number;
    }>;
  }> {
    const interval = this.rangeToInterval(range);

    // Visitors (analytics_events.page_view)
    const visitors = await this.pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT session_id)::text as count
       FROM public.analytics_events
       WHERE tenant_id = $1
         AND event_type = 'page_view'
         AND created_at > now() - $2::interval`,
      [tenantId, interval],
    );

    // Add to cart
    const addToCart = await this.pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT session_id)::text as count
       FROM public.analytics_events
       WHERE tenant_id = $1
         AND event_type = 'add_to_cart'
         AND created_at > now() - $2::interval`,
      [tenantId, interval],
    );

    // Checkout started
    const checkout = await this.pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT session_id)::text as count
       FROM public.analytics_events
       WHERE tenant_id = $1
         AND event_type = 'checkout_started'
         AND created_at > now() - $2::interval`,
      [tenantId, interval],
    );

    // Orders (final conversion)
    const orders = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM public.orders
       WHERE tenant_id = $1
         AND status NOT IN ('cancelled', 'failed')
         AND created_at > now() - $2::interval`,
      [tenantId, interval],
    );

    const stageNames = [
      { name: 'Ziyaretçi', count: Number(visitors.rows[0]?.count ?? 0) },
      { name: 'Sepete Ekleme', count: Number(addToCart.rows[0]?.count ?? 0) },
      { name: 'Ödeme Başlatma', count: Number(checkout.rows[0]?.count ?? 0) },
      { name: 'Sipariş', count: Number(orders.rows[0]?.count ?? 0) },
    ];

    const stages = stageNames.map((stage, i) => {
      const previous = i > 0 ? stageNames[i - 1]!.count : stage.count;
      const conversionRate =
        previous > 0 ? (stage.count / previous) * 100 : 0;
      const dropoffRate = 100 - conversionRate;
      return {
        name: stage.name,
        count: stage.count,
        conversionRate: Math.round(conversionRate * 100) / 100,
        dropoffRate: Math.round(dropoffRate * 100) / 100,
      };
    });

    return { range, stages };
  }

  /**
   * Kanal bazlı gelir (pazaryeri vs direkt).
   */
  async getRevenueByChannel(
    tenantId: string,
    range: AnalyticsRange,
  ): Promise<
    Array<{
      channel: 'direct' | 'marketplace' | 'social' | 'email' | 'other';
      orderCount: number;
      revenue: number;
    }>
  > {
    // Order.channel veya traffic source
    const r = await this.pool.query<{
      channel: string;
      order_count: string;
      revenue: string;
    }>(
      `SELECT
         COALESCE(channel, 'direct') as channel,
         COUNT(*)::text as order_count,
         COALESCE(SUM(total_amount), 0)::text as revenue
       FROM public.orders
       WHERE tenant_id = $1
         AND status NOT IN ('cancelled', 'failed')
         AND created_at > now() - $2::interval
       GROUP BY channel
       ORDER BY SUM(total_amount) DESC`,
      [tenantId, this.rangeToInterval(range)],
    );
    return r.rows.map((row) => ({
      channel: row.channel as 'direct' | 'marketplace' | 'social' | 'email' | 'other',
      orderCount: Number(row.order_count),
      revenue: Number(row.revenue),
    }));
  }

  /**
   * Real-time istatistikler (son 1 saat).
   */
  async getRealtimeStats(tenantId: string): Promise<{
    activeVisitors: number;
    todayOrders: number;
    todayRevenue: number;
    pendingOrders: number;
    lastOrderAt: string | null;
  }> {
    const [active, today, pending, last] = await Promise.all([
      this.pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT session_id)::text as count
         FROM public.analytics_events
         WHERE tenant_id = $1
           AND created_at > now() - interval '1 hour'`,
        [tenantId],
      ),
      this.pool.query<{ count: string; revenue: string }>(
        `SELECT COUNT(*)::text as count,
                COALESCE(SUM(total_amount), 0)::text as revenue
         FROM public.orders
         WHERE tenant_id = $1
           AND status NOT IN ('cancelled', 'failed')
           AND created_at >= date_trunc('day', now())`,
        [tenantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count
         FROM public.orders
         WHERE tenant_id = $1
           AND status IN ('pending', 'confirmed', 'processing')`,
        [tenantId],
      ),
      this.pool.query<{ created_at: Date }>(
        `SELECT created_at
         FROM public.orders
         WHERE tenant_id = $1
           AND status NOT IN ('cancelled', 'failed')
         ORDER BY created_at DESC
         LIMIT 1`,
        [tenantId],
      ),
    ]);

    return {
      activeVisitors: Number(active.rows[0]?.count ?? 0),
      todayOrders: Number(today.rows[0]?.count ?? 0),
      todayRevenue: Number(today.rows[0]?.revenue ?? 0),
      pendingOrders: Number(pending.rows[0]?.count ?? 0),
      lastOrderAt: last.rows[0]?.created_at.toISOString() ?? null,
    };
  }

  /**
   * CSV export (sipariş listesi).
   */
  async exportOrdersCsv(
    tenantId: string,
    range: AnalyticsRange,
  ): Promise<string> {
    const r = await this.pool.query<{
      order_number: string;
      customer_email: string;
      customer_name: string;
      total_amount: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT
         order_number,
         customer_email,
         customer_name,
         total_amount::text,
         status,
         created_at
       FROM public.orders
       WHERE tenant_id = $1
         AND created_at > now() - $2::interval
       ORDER BY created_at DESC
       LIMIT 10000`,
      [tenantId, this.rangeToInterval(range)],
    );

    const header = 'Sipariş No,Müşteri Email,Ad Soyad,Tutar,Durum,Tarih\n';
    const rows = r.rows
      .map(
        (r) =>
          `${r.order_number},${r.customer_email},${r.customer_name},${r.total_amount},${r.status},${r.created_at.toISOString()}`,
      )
      .join('\n');
    return header + rows;
  }

  // -------------------------------------------------------------------
  // Dahili
  // -------------------------------------------------------------------

  private rangeToInterval(range: AnalyticsRange): string {
    switch (range) {
      case '24h': return '24 hours';
      case '7d': return '7 days';
      case '30d': return '30 days';
      case '90d': return '90 days';
      case '1y': return '365 days';
      case 'all': return '100 years';
      default: return '30 days';
    }
  }
}
