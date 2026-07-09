/**
 * Subscription plan ve plan feature repository.
 *
 * Paket tanımları (Starter, Growth, Pro, Enterprise) bu katmandan
 * yönetilir. Seed verisi `seed.ts` üzerinden eklenir.
 */

import type { Pool, PoolClient } from 'pg';
import type {
  PlanCode,
  PlanFeature,
  SubscriptionPlan,
} from '@eticart/shared-types';

export interface PlanRow {
  id: string;
  code: PlanCode;
  name: string;
  description: string;
  monthly_price_kurus: string; // bigint -> string
  yearly_price_kurus: string;
  currency: string;
  trial_days: number;
  max_users: number;
  max_products: number;
  max_orders_per_month: number;
  max_storage_bytes: string;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export function mapPlanRow(row: PlanRow): SubscriptionPlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    monthlyPriceKurus: Number(row.monthly_price_kurus),
    yearlyPriceKurus: Number(row.yearly_price_kurus),
    currency: row.currency,
    trialDays: row.trial_days,
    maxUsers: row.max_users,
    maxProducts: row.max_products,
    maxOrdersPerMonth: row.max_orders_per_month,
    maxStorageBytes: Number(row.max_storage_bytes),
    isActive: row.is_active,
    sortOrder: row.sort_order,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface PlanFeatureRow {
  id: string;
  plan_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export function mapPlanFeatureRow(row: PlanFeatureRow): PlanFeature {
  return {
    id: row.id,
    planId: row.plan_id,
    featureKey: row.feature_key,
    enabled: row.enabled,
    limitValue: row.limit_value !== null ? Number(row.limit_value) : null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export interface UpsertPlanInput {
  code: PlanCode;
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
}

export class PlansRepository {
  constructor(private readonly pool: Pool) {}

  /** Kod ile tek plan getir. */
  async findByCode(code: PlanCode): Promise<SubscriptionPlan | null> {
    const r = await this.pool.query<PlanRow>(
      `SELECT * FROM public.subscription_plans WHERE code = $1`,
      [code],
    );
    return r.rows[0] ? mapPlanRow(r.rows[0]) : null;
  }

  /** Tüm aktif planları sıralı getir. */
  async listActive(): Promise<SubscriptionPlan[]> {
    const r = await this.pool.query<PlanRow>(
      `SELECT * FROM public.subscription_plans
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, code ASC`,
    );
    return r.rows.map(mapPlanRow);
  }

  /** Bir plana ait tüm özellikleri getir. */
  async listFeatures(planId: string): Promise<PlanFeature[]> {
    const r = await this.pool.query<PlanFeatureRow>(
      `SELECT * FROM public.plan_features WHERE plan_id = $1`,
      [planId],
    );
    return r.rows.map(mapPlanFeatureRow);
  }

  /** Kod ile plan + özelliklerini getir. */
  async findWithFeatures(
    code: PlanCode,
  ): Promise<{ plan: SubscriptionPlan; features: PlanFeature[] } | null> {
    const plan = await this.findByCode(code);
    if (!plan) return null;
    const features = await this.listFeatures(plan.id);
    return { plan, features };
  }

  /**
   * Plan upsert. `code` unique; aynı kod mevcutsa günceller.
   * Feature'lar transaction içinde senkronize edilir.
   */
  async upsert(
    input: UpsertPlanInput,
    runner: Pool | PoolClient = this.pool,
  ): Promise<{ plan: SubscriptionPlan; features: PlanFeature[] }> {
    const r = await runner.query<PlanRow>(
      `INSERT INTO public.subscription_plans (
          code, name, description,
          monthly_price_kurus, yearly_price_kurus, currency,
          trial_days, max_users, max_products, max_orders_per_month,
          max_storage_bytes, sort_order, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          monthly_price_kurus = EXCLUDED.monthly_price_kurus,
          yearly_price_kurus = EXCLUDED.yearly_price_kurus,
          currency = EXCLUDED.currency,
          trial_days = EXCLUDED.trial_days,
          max_users = EXCLUDED.max_users,
          max_products = EXCLUDED.max_products,
          max_orders_per_month = EXCLUDED.max_orders_per_month,
          max_storage_bytes = EXCLUDED.max_storage_bytes,
          sort_order = EXCLUDED.sort_order,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
        RETURNING *`,
      [
        input.code,
        input.name,
        input.description,
        input.monthlyPriceKurus,
        input.yearlyPriceKurus,
        input.currency,
        input.trialDays,
        input.maxUsers,
        input.maxProducts,
        input.maxOrdersPerMonth,
        input.maxStorageBytes,
        input.sortOrder,
        input.isActive,
      ],
    );
    const plan = mapPlanRow(r.rows[0]!);

    // Feature senkronizasyonu: sil + ekle (idempotent)
    await runner.query(`DELETE FROM public.plan_features WHERE plan_id = $1`, [plan.id]);
    for (const f of input.features) {
      await runner.query(
        `INSERT INTO public.plan_features (plan_id, feature_key, enabled, limit_value)
         VALUES ($1, $2, $3, $4)`,
        [plan.id, f.featureKey, f.enabled, f.limitValue],
      );
    }

    const features = await this.listFeatures(plan.id);
    return { plan, features };
  }
}