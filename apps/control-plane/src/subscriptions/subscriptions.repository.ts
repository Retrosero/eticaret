/**
 * Subscription repository.
 *
 * `public.tenant_subscriptions` üzerinde CRUD.
 */

import type { Pool, PoolClient } from 'pg';
import type {
  BillingCycle,
  SubscriptionStatus,
  TenantSubscription,
} from '@eticart/shared-types';

export interface SubscriptionRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  started_at: Date;
  current_period_start: Date;
  current_period_end: Date;
  trial_end_at: Date | null;
  cancelled_at: Date | null;
  external_subscription_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export function mapSubscriptionRow(row: SubscriptionRow): TenantSubscription {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planId: row.plan_id,
    status: row.status,
    billingCycle: row.billing_cycle,
    startedAt: row.started_at.toISOString(),
    currentPeriodStart: row.current_period_start.toISOString(),
    currentPeriodEnd: row.current_period_end.toISOString(),
    trialEndAt: row.trial_end_at ? row.trial_end_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    externalSubscriptionId: row.external_subscription_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface CreateSubscriptionDbInput {
  tenantId: string;
  planId: string;
  billingCycle: BillingCycle;
  startedAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndAt: Date | null;
}

export class SubscriptionsRepository {
  constructor(private readonly pool: Pool) {}

  /** Tenant'ın aktif aboneliğini getir (status='active' veya 'past_due'). */
  async findActiveByTenant(tenantId: string): Promise<TenantSubscription | null> {
    const r = await this.pool.query<SubscriptionRow>(
      `SELECT * FROM public.tenant_subscriptions
       WHERE tenant_id = $1 AND status IN ('active', 'past_due', 'pending', 'trial')
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId],
    );
    return r.rows[0] ? mapSubscriptionRow(r.rows[0]) : null;
  }

  /** Tüm abonelikleri listele. */
  async listByTenant(tenantId: string): Promise<TenantSubscription[]> {
    const r = await this.pool.query<SubscriptionRow>(
      `SELECT * FROM public.tenant_subscriptions
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return r.rows.map(mapSubscriptionRow);
  }

  async create(
    input: CreateSubscriptionDbInput,
    runner: Pool | PoolClient = this.pool,
  ): Promise<TenantSubscription> {
    const r = await runner.query<SubscriptionRow>(
      `INSERT INTO public.tenant_subscriptions (
          tenant_id, plan_id, status, billing_cycle,
          started_at, current_period_start, current_period_end,
          trial_end_at
        ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)
        RETURNING *`,
      [
        input.tenantId,
        input.planId,
        input.billingCycle,
        input.startedAt,
        input.currentPeriodStart,
        input.currentPeriodEnd,
        input.trialEndAt,
      ],
    );
    return mapSubscriptionRow(r.rows[0]!);
  }

  async update(
    id: string,
    patch: Partial<{
      status: SubscriptionStatus;
      cancelledAt: Date | null;
      externalSubscriptionId: string | null;
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
    }>,
    runner: Pool | PoolClient = this.pool,
  ): Promise<TenantSubscription> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.status !== undefined) {
      fields.push(`status = $${i++}`);
      values.push(patch.status);
    }
    if (patch.cancelledAt !== undefined) {
      fields.push(`cancelled_at = $${i++}`);
      values.push(patch.cancelledAt);
    }
    if (patch.externalSubscriptionId !== undefined) {
      fields.push(`external_subscription_id = $${i++}`);
      values.push(patch.externalSubscriptionId);
    }
    if (patch.currentPeriodStart !== undefined) {
      fields.push(`current_period_start = $${i++}`);
      values.push(patch.currentPeriodStart);
    }
    if (patch.currentPeriodEnd !== undefined) {
      fields.push(`current_period_end = $${i++}`);
      values.push(patch.currentPeriodEnd);
    }
    if (fields.length === 0) {
      const r = await runner.query<SubscriptionRow>(
        `SELECT * FROM public.tenant_subscriptions WHERE id = $1`,
        [id],
      );
      if (!r.rows[0]) throw new Error('Abonelik bulunamadı: ' + id);
      return mapSubscriptionRow(r.rows[0]);
    }
    values.push(id);
    const r = await runner.query<SubscriptionRow>(
      `UPDATE public.tenant_subscriptions SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING *`,
      values,
    );
    if (!r.rows[0]) throw new Error('Abonelik güncellenemedi: ' + id);
    return mapSubscriptionRow(r.rows[0]);
  }
}