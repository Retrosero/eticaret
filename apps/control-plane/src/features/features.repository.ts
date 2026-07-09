/**
 * Tenant feature repository.
 *
 * Paket dışı tenant-bazlı override'ları ve toplu feature listelerini
 * yönetir.
 */

import type { Pool } from 'pg';
import type {
  FeatureKey,
  TenantFeature,
} from '@eticart/shared-types';

export interface TenantFeatureRow {
  id: string;
  tenant_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value: string | null;
  source: 'plan' | 'manual' | 'trial' | 'promotion';
  expires_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export function mapTenantFeatureRow(row: TenantFeatureRow): TenantFeature {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    featureKey: row.feature_key,
    enabled: row.enabled,
    limitValue: row.limit_value !== null ? Number(row.limit_value) : null,
    source: row.source,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface UpsertTenantFeatureInput {
  tenantId: string;
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  source: 'plan' | 'manual' | 'trial' | 'promotion';
  expiresAt: Date | null;
}

export class FeaturesRepository {
  constructor(private readonly pool: Pool) {}

  async listByTenant(tenantId: string): Promise<TenantFeature[]> {
    const r = await this.pool.query<TenantFeatureRow>(
      `SELECT * FROM public.tenant_features WHERE tenant_id = $1`,
      [tenantId],
    );
    return r.rows.map(mapTenantFeatureRow);
  }

  async findOne(tenantId: string, key: FeatureKey): Promise<TenantFeature | null> {
    const r = await this.pool.query<TenantFeatureRow>(
      `SELECT * FROM public.tenant_features
       WHERE tenant_id = $1 AND feature_key = $2`,
      [tenantId, key],
    );
    return r.rows[0] ? mapTenantFeatureRow(r.rows[0]) : null;
  }

  async upsert(input: UpsertTenantFeatureInput): Promise<TenantFeature> {
    const r = await this.pool.query<TenantFeatureRow>(
      `INSERT INTO public.tenant_features (
          tenant_id, feature_key, enabled, limit_value, source, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, feature_key) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          limit_value = EXCLUDED.limit_value,
          source = EXCLUDED.source,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
        RETURNING *`,
      [
        input.tenantId,
        input.featureKey,
        input.enabled,
        input.limitValue,
        input.source,
        input.expiresAt,
      ],
    );
    return mapTenantFeatureRow(r.rows[0]!);
  }

  async remove(tenantId: string, key: string): Promise<boolean> {
    const r = await this.pool.query(
      `DELETE FROM public.tenant_features WHERE tenant_id = $1 AND feature_key = $2`,
      [tenantId, key],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async disable(tenantId: string, key: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.tenant_features SET enabled = FALSE WHERE tenant_id = $1 AND feature_key = $2`,
      [tenantId, key],
    );
  }
}