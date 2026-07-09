/**
 * Tenant Analytics + Churn Prediction.
 *
 * Faz 29: Super admin için platform-wide analytics.
 * - Tenant cohort (signup date bazlı)
 * - MRR/ARR
 * - Churn risk (basit kural bazlı)
 * - Engagement score
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Logger } from '@eticart/config';

import { LOGGER_TOKEN } from '../common/logger.js';

export interface TenantAnalytics {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  mrrTry: number;
  arrTry: number;
  arpuTry: number;
  churnRate30d: number;
  /** Riskli tenant'lar (churn olasılığı yüksek) */
  atRiskTenants: Array<{
    tenantId: string;
    tenantName: string;
    riskScore: number;
    reasons: string[];
    lastActiveAt: string;
  }>;
  /** Plan dağılımı */
  planDistribution: Array<{ planCode: string; count: number; mrrTry: number }>;
  /** Cohort retention (son 6 ay) */
  cohortRetention: Array<{
    month: string; // YYYY-MM
    newTenants: number;
    retained30d: number;
    retained60d: number;
    retained90d: number;
  }>;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
  ) {}

  /**
   * Platform-wide analytics.
   */
  async getTenantAnalytics(): Promise<TenantAnalytics> {
    const [
      tenantStats,
      mrrStats,
      atRisk,
      planDistribution,
      cohort,
    ] = await Promise.all([
      this.getTenantStats(),
      this.getMrrStats(),
      this.getAtRiskTenants(),
      this.getPlanDistribution(),
      this.getCohortRetention(),
    ]);

    return {
      ...tenantStats,
      ...mrrStats,
      atRiskTenants: atRisk,
      planDistribution,
      cohortRetention: cohort,
    };
  }

  private async getTenantStats(): Promise<{
    totalTenants: number;
    activeTenants: number;
    trialTenants: number;
    suspendedTenants: number;
    churnRate30d: number;
  }> {
    const r = await this.pool.query<{
      total: string;
      active: string;
      trial: string;
      suspended: string;
    }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'active') AS active,
              COUNT(*) FILTER (WHERE status = 'trial') AS trial,
              COUNT(*) FILTER (WHERE status = 'suspended') AS suspended
       FROM public.tenants`,
    );
    const row = r.rows[0]!;
    const total = parseInt(row.total, 10);
    const active = parseInt(row.active, 10);

    // Churn = (son 30 gün iptal edilenler) / (30 gün önce aktif olanlar)
    const churnR = await this.pool.query<{ churned: string; wasActive: string }>(
      `SELECT
         (SELECT COUNT(*) FROM public.tenants
          WHERE status = 'cancelled' AND cancelled_at > now() - interval '30 days') AS churned,
         (SELECT COUNT(*) FROM public.tenants
          WHERE created_at < now() - interval '30 days'
            AND status NOT IN ('pending')) AS wasActive`,
    );
    const churned = parseInt(churnR.rows[0]?.churned ?? '0', 10);
    const wasActive = parseInt(churnR.rows[0]?.wasActive ?? '1', 10);
    const churnRate30d = wasActive > 0 ? churned / wasActive : 0;

    return {
      totalTenants: total,
      activeTenants: active,
      trialTenants: parseInt(row.trial, 10),
      suspendedTenants: parseInt(row.suspended, 10),
      churnRate30d,
    };
  }

  private async getMrrStats(): Promise<{ mrrTry: number; arrTry: number; arpuTry: number }> {
    // Subscription üzerinden monthly recurring revenue
    const r = await this.pool.query<{ mrr: string }>(
      `SELECT COALESCE(SUM(p.monthly_price_kurus), 0) AS mrr
       FROM public.subscriptions s
       INNER JOIN public.plans p ON p.code = s.plan_code
       WHERE s.status = 'active'`,
    );
    const mrrKurus = parseFloat(r.rows[0]?.mrr ?? '0');
    const mrrTry = mrrKurus / 100;

    const tenantR = await this.pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT tenant_id) AS count
       FROM public.subscriptions
       WHERE status = 'active'`,
    );
    const activeSubTenants = parseInt(tenantR.rows[0]?.count ?? '1', 10);
    const arpuTry = activeSubTenants > 0 ? mrrTry / activeSubTenants : 0;

    return {
      mrrTry,
      arrTry: mrrTry * 12,
      arpuTry,
    };
  }

  /**
   * Churn risk analizi — basit kural bazlı.
   *
   * Risk faktörleri:
   * - Son 14 gün hiç sipariş yoksa: +30
   * - Son 30 gün hiç login yoksa: +25
   * - Subscription ödeme başarısız: +30
   * - Trial süresi bitmek üzere (< 3 gün): +20
   * - Destek ticketları > 5: +10
   * - Aktif kullanıcı sayısı < 2: +10
   *
   * Toplam >= 50 → "at risk"
   */
  private async getAtRiskTenants(): Promise<TenantAnalytics['atRiskTenants']> {
    const r = await this.pool.query<{ tenant_id: string; name: string }>(
      `SELECT tenant_id, name FROM public.tenants
       WHERE status IN ('active', 'trial')
       LIMIT 100`,
    );

    const atRisk: TenantAnalytics['atRiskTenants'] = [];

    for (const t of r.rows) {
      const [ordersR, lastLoginR, paymentR, trialR, ticketsR, usersR] = await Promise.all([
        this.pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM public.orders
           WHERE tenant_id = $1 AND created_at > now() - interval '14 days'`,
          [t.tenant_id],
        ),
        this.pool.query<{ last_login: Date | null }>(
          `SELECT MAX(last_login_at) AS last_login FROM public.tenant_users
           WHERE tenant_id = $1`,
          [t.tenant_id],
        ),
        this.pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM public.payment_failures
           WHERE tenant_id = $1 AND created_at > now() - interval '30 days'`,
          [t.tenant_id],
        ),
        this.pool.query<{ trial_ends_at: Date }>(
          `SELECT trial_ends_at FROM public.subscriptions
           WHERE tenant_id = $1 AND status = 'trial'
           LIMIT 1`,
          [t.tenant_id],
        ),
        this.pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM public.support_tickets
           WHERE tenant_id = $1 AND status NOT IN ('closed', 'resolved')`,
          [t.tenant_id],
        ),
        this.pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM public.tenant_users
           WHERE tenant_id = $1 AND is_active = true`,
          [t.tenant_id],
        ),
      ]);

      let riskScore = 0;
      const reasons: string[] = [];

      if (parseInt(ordersR.rows[0]?.count ?? '0', 10) === 0) {
        riskScore += 30;
        reasons.push('14 gündür sipariş yok');
      }
      const lastLogin = lastLoginR.rows[0]?.last_login;
      if (!lastLogin || Date.now() - new Date(lastLogin).getTime() > 30 * 86400 * 1000) {
        riskScore += 25;
        reasons.push('30 gündür login yok');
      }
      if (parseInt(paymentR.rows[0]?.count ?? '0', 10) > 0) {
        riskScore += 30;
        reasons.push('Ödeme başarısız');
      }
      const trialEnds = trialR.rows[0]?.trial_ends_at;
      if (trialEnds) {
        const daysLeft = (new Date(trialEnds).getTime() - Date.now()) / 86400 / 1000;
        if (daysLeft > 0 && daysLeft < 3) {
          riskScore += 20;
          reasons.push(`Trial ${daysLeft.toFixed(1)} gün sonra bitiyor`);
        }
      }
      if (parseInt(ticketsR.rows[0]?.count ?? '0', 10) > 5) {
        riskScore += 10;
        reasons.push('5+ açık destek talebi');
      }
      if (parseInt(usersR.rows[0]?.count ?? '0', 10) < 2) {
        riskScore += 10;
        reasons.push('Sadece 1 aktif kullanıcı');
      }

      if (riskScore >= 50) {
        atRisk.push({
          tenantId: t.tenant_id,
          tenantName: t.name,
          riskScore: Math.min(100, riskScore),
          reasons,
          lastActiveAt: lastLogin ? new Date(lastLogin).toISOString() : 'never',
        });
      }
    }

    return atRisk.sort((a, b) => b.riskScore - a.riskScore);
  }

  private async getPlanDistribution(): Promise<TenantAnalytics['planDistribution']> {
    const r = await this.pool.query<{ plan_code: string; count: string; mrr: string }>(
      `SELECT s.plan_code,
              COUNT(*) AS count,
              COALESCE(SUM(p.monthly_price_kurus), 0) AS mrr
       FROM public.subscriptions s
       INNER JOIN public.plans p ON p.code = s.plan_code
       WHERE s.status = 'active'
       GROUP BY s.plan_code`,
    );
    return r.rows.map((row) => ({
      planCode: row.plan_code,
      count: parseInt(row.count, 10),
      mrrTry: parseFloat(row.mrr) / 100,
    }));
  }

  private async getCohortRetention(): Promise<TenantAnalytics['cohortRetention']> {
    const r = await this.pool.query<{
      month: string;
      new_tenants: string;
      retained_30d: string;
      retained_60d: string;
      retained_90d: string;
    }>(
      `WITH cohorts AS (
         SELECT
           date_trunc('month', created_at) AS month,
           COUNT(*) AS new_tenants,
           ARRAY_AGG(id) AS tenant_ids
         FROM public.tenants
         WHERE created_at > now() - interval '6 months'
         GROUP BY date_trunc('month', created_at)
       )
       SELECT
         to_char(c.month, 'YYYY-MM') AS month,
         c.new_tenants::text,
         COUNT(DISTINCT CASE
           WHEN EXISTS (
             SELECT 1 FROM public.orders o
             WHERE o.tenant_id = ANY(c.tenant_ids)
               AND o.created_at BETWEEN c.month AND c.month + interval '60 days'
               AND o.created_at > c.month + interval '30 days'
           ) THEN t.id END
         )::text AS retained_60d,
         COUNT(DISTINCT CASE
           WHEN EXISTS (
             SELECT 1 FROM public.orders o
             WHERE o.tenant_id = ANY(c.tenant_ids)
               AND o.created_at > c.month + interval '60 days'
           ) THEN t.id END
         )::text AS retained_90d,
         0::text AS retained_30d
       FROM cohorts c
       LEFT JOIN public.tenants t ON t.id = ANY(c.tenant_ids)
       GROUP BY c.month, c.new_tenants
       ORDER BY c.month DESC
       LIMIT 6`,
    );
    return r.rows.map((row) => ({
      month: row.month,
      newTenants: parseInt(row.new_tenants, 10),
      retained30d: 0,
      retained60d: parseInt(row.retained_60d, 10),
      retained90d: parseInt(row.retained_90d, 10),
    }));
  }

  /**
   * Tek bir tenant için detaylı engagement score.
   */
  async getEngagementScore(tenantId: string): Promise<{
    score: number;
    metrics: {
      ordersLast30d: number;
      activeUsers: number;
      avgOrderValue: number;
      lastLoginDays: number;
    };
  }> {
    const [ordersR, usersR, avgR, loginR] = await Promise.all([
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM public.orders
         WHERE tenant_id = $1 AND created_at > now() - interval '30 days'`,
        [tenantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM public.tenant_users
         WHERE tenant_id = $1 AND is_active = true`,
        [tenantId],
      ),
      this.pool.query<{ avg: string }>(
        `SELECT COALESCE(AVG(total), 0) AS avg FROM public.orders
         WHERE tenant_id = $1 AND status != 'cancelled'`,
        [tenantId],
      ),
      this.pool.query<{ last_login: Date | null }>(
        `SELECT MAX(last_login_at) AS last_login FROM public.tenant_users
         WHERE tenant_id = $1`,
        [tenantId],
      ),
    ]);

    const ordersLast30d = parseInt(ordersR.rows[0]?.count ?? '0', 10);
    const activeUsers = parseInt(usersR.rows[0]?.count ?? '0', 10);
    const avgOrderValue = parseFloat(avgR.rows[0]?.avg ?? '0');
    const lastLogin = loginR.rows[0]?.last_login;
    const lastLoginDays = lastLogin
      ? Math.floor((Date.now() - new Date(lastLogin).getTime()) / 86400 / 1000)
      : 999;

    // Score: 0-100
    let score = 0;
    score += Math.min(ordersLast30d * 5, 40); // Max 40 puan sipariş
    score += Math.min(activeUsers * 10, 30); // Max 30 puan kullanıcı
    score += Math.min(avgOrderValue / 100, 20); // Max 20 puan AOV
    if (lastLoginDays <= 7) score += 10;
    else if (lastLoginDays <= 30) score += 5;

    return {
      score: Math.min(100, score),
      metrics: {
        ordersLast30d,
        activeUsers,
        avgOrderValue,
        lastLoginDays,
      },
    };
  }
}