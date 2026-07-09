/**
 * Super Admin Service — Platform yönetim iş mantığı.
 *
 * Dashboard, metrics, tenant/plan/subscription yönetim ve audit
 * log sorgulama işlemlerini içerir.
 *
 * Tüm işlemler `super_admin` rolü gerektirir ve audit log'a
 * `actor_type='super_admin'` olarak kaydedilir.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';

import { LOGGER_TOKEN } from '../common/logger.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { PlansService } from '../plans/plans.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class SuperAdminService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
    private readonly tenantsService: TenantsService,
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────

  /**
   * Süper admin dashboard özet verisi.
   * - Aktif tenant sayısı
   * - MRR (Monthly Recurring Revenue)
   * - ARR (Annual Recurring Revenue)
   * - Trial tenant sayısı
   * - Son 24 saatteki signup'lar
   * - Depolama kullanımı
   * - Platform health
   */
  async getDashboard(): Promise<{
    totalTenants: number;
    activeTenants: number;
    trialTenants: number;
    suspendedTenants: number;
    overdueTenants: number;
    mrrKurus: number;
    arrKurus: number;
    signupsLast24h: number;
    signupsLast7d: number;
    churnRate30d: number;
    storageUsedBytes: number;
    tenantsByPlan: Array<{ planCode: string; count: number }>;
    recentActivity: Array<{
      tenantId: string;
      slug: string;
      action: string;
      at: string;
    }>;
  }> {
    // Tenant counts
    const tenantStats = await this.pool.query<{
      status: string;
      count: string;
    }>(
      `SELECT status, COUNT(*)::text as count
       FROM public.tenants
       WHERE status != 'archived'
       GROUP BY status`,
    );
    const statsMap: Record<string, number> = {};
    for (const row of tenantStats.rows) {
      statsMap[row.status] = Number(row.count);
    }

    // MRR calculation (active subscriptions)
    const mrr = await this.pool.query<{ mrr_kurus: string }>(
      `SELECT COALESCE(SUM(
         CASE
           WHEN s.billing_cycle = 'yearly' THEN p.monthly_price_kurus
           ELSE p.monthly_price_kurus
         END
       ), 0)::text as mrr_kurus
       FROM public.tenant_subscriptions s
       INNER JOIN public.subscription_plans p ON p.id = s.plan_id
       WHERE s.status IN ('active', 'trialing')`,
    );
    const mrrKurus = Number(mrr.rows[0]?.mrr_kurus ?? '0');
    const arrKurus = mrrKurus * 12;

    // Signups
    const signups24h = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM public.tenants
       WHERE created_at > now() - interval '24 hours'`,
    );
    const signups7d = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM public.tenants
       WHERE created_at > now() - interval '7 days'`,
    );

    // Churn (son 30 gün iptal edilenler / aktif olanlar)
    const churn = await this.pool.query<{ cancelled: string; active: string }>(
      `SELECT
         (SELECT COUNT(*) FROM public.tenant_subscriptions
          WHERE status = 'cancelled'
            AND cancelled_at > now() - interval '30 days')::text as cancelled,
         (SELECT COUNT(*) FROM public.tenant_subscriptions
          WHERE status = 'active')::text as active`,
    );
    const cancelled = Number(churn.rows[0]?.cancelled ?? '0');
    const active = Number(churn.rows[0]?.active ?? '1');
    const churnRate = active > 0 ? (cancelled / active) * 100 : 0;

    // Tenants by plan
    const planDistribution = await this.pool.query<{
      plan: string;
      count: string;
    }>(
      `SELECT plan, COUNT(*)::text as count
       FROM public.tenants
       WHERE status != 'archived'
       GROUP BY plan
       ORDER BY count DESC`,
    );

    // Storage usage (toplam)
    const storage = await this.pool.query<{ used: string }>(
      `SELECT COALESCE(SUM(used_bytes), 0)::text as used
       FROM public.tenant_storage_usage`,
    );

    // Recent activity (son 20 audit event)
    const recent = await this.pool.query<{
      tenant_id: string;
      slug: string;
      action: string;
      created_at: Date;
    }>(
      `SELECT a.tenant_id, t.slug, a.action, a.created_at
       FROM public.audit_logs a
       INNER JOIN public.tenants t ON t.id = a.tenant_id
       WHERE a.tenant_id IS NOT NULL
       ORDER BY a.created_at DESC
       LIMIT 20`,
    );

    return {
      totalTenants: Object.values(statsMap).reduce((a, b) => a + b, 0),
      activeTenants: statsMap['active'] ?? 0,
      trialTenants: statsMap['trial'] ?? 0,
      suspendedTenants: statsMap['suspended'] ?? 0,
      overdueTenants: statsMap['overdue'] ?? 0,
      mrrKurus,
      arrKurus,
      signupsLast24h: Number(signups24h.rows[0]?.count ?? '0'),
      signupsLast7d: Number(signups7d.rows[0]?.count ?? '0'),
      churnRate30d: Math.round(churnRate * 100) / 100,
      storageUsedBytes: Number(storage.rows[0]?.used ?? '0'),
      tenantsByPlan: planDistribution.rows.map((r) => ({
        planCode: r.plan,
        count: Number(r.count),
      })),
      recentActivity: recent.rows.map((r) => ({
        tenantId: r.tenant_id,
        slug: r.slug,
        action: r.action,
        at: r.created_at.toISOString(),
      })),
    };
  }

  /**
   * Detaylı metrikler (zaman serisi).
   * range: '7d' | '30d' | '90d' | '1y'
   */
  async getMetrics(range: string): Promise<{
    range: string;
    signups: Array<{ date: string; count: number }>;
    revenue: Array<{ date: string; amount: number }>;
    activeTenants: Array<{ date: string; count: number }>;
  }> {
    const days = this.parseRangeToDays(range);
    const interval = `interval '${days} days'`;

    const signups = await this.pool.query<{
      date: string;
      count: string;
    }>(
      `SELECT date_trunc('day', created_at)::date::text as date,
              COUNT(*)::text as count
       FROM public.tenants
       WHERE created_at > now() - ${interval}
       GROUP BY date
       ORDER BY date ASC`,
    );

    const revenue = await this.pool.query<{
      date: string;
      amount: string;
    }>(
      `SELECT date_trunc('day', created_at)::date::text as date,
              COALESCE(SUM(p.monthly_price_kurus), 0)::text as amount
       FROM public.tenant_subscriptions s
       INNER JOIN public.subscription_plans p ON p.id = s.plan_id
       WHERE s.created_at > now() - ${interval}
         AND s.status IN ('active', 'trialing')
       GROUP BY date
       ORDER BY date ASC`,
    );

    // Active tenants (per day, snapshot)
    const active = await this.pool.query<{
      date: string;
      count: string;
    }>(
      `WITH days AS (
         SELECT generate_series(
           date_trunc('day', now() - ${interval}),
           date_trunc('day', now()),
           interval '1 day'
         )::date as d
       )
       SELECT d::text as date,
              (SELECT COUNT(*) FROM public.tenants
               WHERE created_at <= d
                 AND (archived_at IS NULL OR archived_at > d))::text as count
       FROM days
       ORDER BY d ASC`,
    );

    return {
      range,
      signups: signups.rows.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
      revenue: revenue.rows.map((r) => ({
        date: r.date,
        amount: Number(r.amount),
      })),
      activeTenants: active.rows.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // TENANT YÖNETİMİ
  // ─────────────────────────────────────────────────────────────

  async listTenants(filter: {
    page: number;
    limit: number;
    status?: string;
    plan?: string;
    search?: string;
  }): Promise<{
    items: Array<{
      id: string;
      slug: string;
      name: string;
      status: string;
      plan: string;
      ownerEmail: string | null;
      createdAt: string;
      trialEndsAt: string | null;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const conditions: string[] = ["status != 'archived'"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filter.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filter.status);
    }
    if (filter.plan) {
      conditions.push(`plan = $${paramIdx++}`);
      params.push(filter.plan);
    }
    if (filter.search) {
      conditions.push(
        `(slug ILIKE $${paramIdx} OR name ILIKE $${paramIdx})`,
      );
      params.push(`%${filter.search}%`);
      paramIdx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (filter.page - 1) * filter.limit;

    const items = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
      status: string;
      plan: string;
      owner_email: string | null;
      created_at: Date;
      trial_ends_at: Date | null;
    }>(
      `SELECT id, slug, name, status, plan, owner_email, created_at, trial_ends_at
       FROM public.tenants
       ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, filter.limit, offset],
    );

    const total = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM public.tenants ${where}`,
      params,
    );

    return {
      items: items.rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        status: r.status,
        plan: r.plan,
        ownerEmail: r.owner_email,
        createdAt: r.created_at.toISOString(),
        trialEndsAt: r.trial_ends_at?.toISOString() ?? null,
      })),
      total: Number(total.rows[0]?.count ?? '0'),
      page: filter.page,
      limit: filter.limit,
    };
  }

  async getTenantDetail(id: string): Promise<{
    tenant: unknown;
    subscription: unknown | null;
    userCount: number;
    storageBytes: number;
    recentAudit: unknown[];
  }> {
    const tenant = await this.tenantsService.findById(id);
    if (!tenant) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tenant bulunamadı.');
    }

    const sub = await this.subscriptions.getActiveForTenant(id);
    const users = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM public.tenant_users WHERE tenant_id = $1`,
      [id],
    );
    const storage = await this.pool.query<{ used: string }>(
      `SELECT COALESCE(SUM(used_bytes), 0)::text as used
       FROM public.tenant_storage_usage WHERE tenant_id = $1`,
      [id],
    );
    const audit = await this.pool.query(
      `SELECT id, action, resource_type, resource_id, actor_email, created_at
       FROM public.audit_logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [id],
    );

    return {
      tenant,
      subscription: sub,
      userCount: Number(users.rows[0]?.count ?? '0'),
      storageBytes: Number(storage.rows[0]?.used ?? '0'),
      recentAudit: audit.rows,
    };
  }

  async suspendTenant(
    id: string,
    reason: string,
  ): Promise<{ ok: true; tenantId: string }> {
    const tenant = await this.tenantsService.findById(id);
    if (!tenant) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tenant bulunamadı.');
    }
    await this.tenantsService.suspend(id, { reason } as any);
    await this.audit.log({
      action: 'super_admin.tenant.suspend',
      resourceType: 'tenant',
      resourceId: id,
      tenantId: id,
      actorType: 'super_admin',
      after: { reason, suspendedAt: new Date() },
    });
    this.logger.warn({ tenantId: id, reason }, 'Tenant askıya alındı (super admin)');
    return { ok: true, tenantId: id };
  }

  async reactivateTenant(id: string): Promise<{ ok: true; tenantId: string }> {
    const tenant = await this.tenantsService.findById(id);
    if (!tenant) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tenant bulunamadı.');
    }
    await this.tenantsService.reactivate(id, null);
    await this.audit.log({
      action: 'super_admin.tenant.reactivate',
      resourceType: 'tenant',
      resourceId: id,
      tenantId: id,
      actorType: 'super_admin',
      after: { reactivatedAt: new Date() },
    });
    this.logger.info({ tenantId: id }, 'Tenant yeniden aktifleştirildi (super admin)');
    return { ok: true, tenantId: id };
  }

  async archiveTenant(
    id: string,
    reason?: string,
  ): Promise<{ ok: true; tenantId: string }> {
    const tenant = await this.tenantsService.findById(id);
    if (!tenant) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tenant bulunamadı.');
    }
    await this.tenantsService.archive(id, null);
    await this.audit.log({
      action: 'super_admin.tenant.archive',
      resourceType: 'tenant',
      resourceId: id,
      tenantId: id,
      actorType: 'super_admin',
      after: { reason, archivedAt: new Date() },
    });
    this.logger.warn({ tenantId: id, reason }, 'Tenant arşivlendi (super admin)');
    return { ok: true, tenantId: id };
  }

  // ─────────────────────────────────────────────────────────────
  // PLAN YÖNETİMİ
  // ─────────────────────────────────────────────────────────────

  async listAllPlans(): Promise<unknown[]> {
    return this.plans.listActive();
  }

  async createPlan(input: {
    code: string;
    name: string;
    description: string;
    monthlyPriceKurus: number;
    yearlyPriceKurus: number;
    currency: string;
    trialDays: number;
    maxUsers: number;
    maxProducts: number;
    maxOrdersPerMonth: number;
    maxStorageBytes: number;
    sortOrder: number;
    isActive: boolean;
    features: Array<{
      featureKey: string;
      enabled: boolean;
      limitValue: number | null;
    }>;
  }): Promise<unknown> {
    const result = await this.plans.upsert({
      code: input.code as any,
      name: input.name,
      description: input.description,
      monthlyPriceKurus: input.monthlyPriceKurus,
      yearlyPriceKurus: input.yearlyPriceKurus,
      currency: input.currency,
      trialDays: input.trialDays,
      maxUsers: input.maxUsers,
      maxProducts: input.maxProducts,
      maxOrdersPerMonth: input.maxOrdersPerMonth,
      maxStorageBytes: input.maxStorageBytes,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      features: input.features,
    });

    await this.audit.log({
      action: 'super_admin.plan.create',
      resourceType: 'plan',
      resourceId: input.code,
      actorType: 'super_admin',
      after: input as unknown as Record<string, unknown>,
    });

    this.logger.info({ code: input.code }, 'Yeni plan oluşturuldu (super admin)');
    return result;
  }

  async updatePlan(
    id: string,
    input: Partial<{
      name: string;
      description: string;
      monthlyPriceKurus: number;
      yearlyPriceKurus: number;
      trialDays: number;
      maxUsers: number;
      maxProducts: number;
      maxOrdersPerMonth: number;
      maxStorageBytes: number;
      sortOrder: number;
      isActive: boolean;
      features: Array<{
        featureKey: string;
        enabled: boolean;
        limitValue: number | null;
      }>;
    }>,
  ): Promise<unknown> {
    // Plan code is required to upsert — fetch first
    const planList = await this.plans.listActive();
    const existing = planList.find((p) => p.id === id);
    if (!existing) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Plan bulunamadı.');
    }
    const result = await this.plans.upsert({
      code: existing.code,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      monthlyPriceKurus: input.monthlyPriceKurus ?? existing.monthlyPriceKurus,
      yearlyPriceKurus: input.yearlyPriceKurus ?? existing.yearlyPriceKurus,
      currency: existing.currency,
      trialDays: input.trialDays ?? existing.trialDays,
      maxUsers: input.maxUsers ?? existing.maxUsers,
      maxProducts: input.maxProducts ?? existing.maxProducts,
      maxOrdersPerMonth:
        input.maxOrdersPerMonth ?? existing.maxOrdersPerMonth,
      maxStorageBytes: input.maxStorageBytes ?? existing.maxStorageBytes,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      isActive: input.isActive ?? existing.isActive,
      features: input.features ?? [],
    });
    await this.audit.log({
      action: 'super_admin.plan.update',
      resourceType: 'plan',
      resourceId: id,
      actorType: 'super_admin',
      before: existing as unknown as Record<string, unknown>,
      after: input as unknown as Record<string, unknown>,
    });
    return result;
  }

  async deactivatePlan(id: string): Promise<{ ok: true; planId: string }> {
    const planList = await this.plans.listActive();
    const existing = planList.find((p) => p.id === id);
    if (!existing) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Plan bulunamadı.');
    }
    await this.plans.upsert({
      code: existing.code,
      name: existing.name,
      description: existing.description,
      monthlyPriceKurus: existing.monthlyPriceKurus,
      yearlyPriceKurus: existing.yearlyPriceKurus,
      currency: existing.currency,
      trialDays: existing.trialDays,
      maxUsers: existing.maxUsers,
      maxProducts: existing.maxProducts,
      maxOrdersPerMonth: existing.maxOrdersPerMonth,
      maxStorageBytes: existing.maxStorageBytes,
      sortOrder: existing.sortOrder,
      isActive: false,
      features: [],
    });
    await this.audit.log({
      action: 'super_admin.plan.deactivate',
      resourceType: 'plan',
      resourceId: id,
      actorType: 'super_admin',
      after: { deactivatedAt: new Date() },
    });
    return { ok: true, planId: id };
  }

  // ─────────────────────────────────────────────────────────────
  // SUBSCRIPTION YÖNETİMİ
  // ─────────────────────────────────────────────────────────────

  async listSubscriptions(filter: {
    status?: string;
    plan?: string;
  }): Promise<unknown[]> {
    // Implement SubscriptionsService'e göre
    if (filter.status) {
      // Query db
      const r = await this.pool.query(
        `SELECT s.*, t.slug, t.name as tenant_name
         FROM public.tenant_subscriptions s
         INNER JOIN public.tenants t ON t.id = s.tenant_id
         WHERE s.status = $1
         ORDER BY s.created_at DESC
         LIMIT 100`,
        [filter.status],
      );
      return r.rows;
    }
    const r = await this.pool.query(
      `SELECT s.*, t.slug, t.name as tenant_name
       FROM public.tenant_subscriptions s
       INNER JOIN public.tenants t ON t.id = s.tenant_id
       ORDER BY s.created_at DESC
       LIMIT 100`,
    );
    return r.rows;
  }

  async cancelSubscription(
    id: string,
    reason?: string,
    refund: boolean = false,
  ): Promise<{ ok: true; subscriptionId: string; refunded: boolean }> {
    await this.subscriptions.cancel(
      id,
      { atPeriodEnd: false, reason },
      null,
    );
    await this.audit.log({
      action: 'super_admin.subscription.cancel',
      resourceType: 'subscription',
      resourceId: id,
      actorType: 'super_admin',
      after: { reason, refund, cancelledAt: new Date() },
    });
    this.logger.warn(
      { subscriptionId: id, reason, refund },
      'Subscription iptal edildi (super admin)',
    );
    return { ok: true, subscriptionId: id, refunded: refund };
  }

  // ─────────────────────────────────────────────────────────────
  // AUDIT LOG
  // ─────────────────────────────────────────────────────────────

  async queryAuditLog(filter: {
    page: number;
    limit: number;
    tenantId?: string;
    actorId?: string;
    action?: string;
    resourceType?: string;
    from?: string;
    to?: string;
  }): Promise<{
    items: unknown[];
    total: number;
    page: number;
    limit: number;
  }> {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.tenantId) {
      conditions.push(`tenant_id = $${i++}`);
      params.push(filter.tenantId);
    }
    if (filter.actorId) {
      conditions.push(`actor_id = $${i++}`);
      params.push(filter.actorId);
    }
    if (filter.action) {
      conditions.push(`action ILIKE $${i++}`);
      params.push(`%${filter.action}%`);
    }
    if (filter.resourceType) {
      conditions.push(`resource_type = $${i++}`);
      params.push(filter.resourceType);
    }
    if (filter.from) {
      conditions.push(`created_at >= $${i++}`);
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push(`created_at <= $${i++}`);
      params.push(filter.to);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (filter.page - 1) * filter.limit;

    const items = await this.pool.query(
      `SELECT a.*, t.slug as tenant_slug
       FROM public.audit_logs a
       LEFT JOIN public.tenants t ON t.id = a.tenant_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, filter.limit, offset],
    );
    const total = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM public.audit_logs ${where}`,
      params,
    );

    return {
      items: items.rows,
      total: Number(total.rows[0]?.count ?? '0'),
      page: filter.page,
      limit: filter.limit,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Dahili
  // ─────────────────────────────────────────────────────────────

  private parseRangeToDays(range: string): number {
    if (range === '7d') return 7;
    if (range === '30d') return 30;
    if (range === '90d') return 90;
    if (range === '1y') return 365;
    return 30;
  }
}
