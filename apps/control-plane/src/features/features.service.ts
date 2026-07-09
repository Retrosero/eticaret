/**
 * Tenant özellik yönetim servisi.
 *
 * Paket özellikleri ile tenant bazlı override'ları birleştirip
 * tek bir "etkin mi?" kararı verir.
 *
 * Öncelik sırası:
 *   1) tenant_features (override) — süresi dolmamışsa kazanır
 *   2) plan_features (paket tanımı)
 *   3) false (özellik tanımsız)
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  FeatureKey,
  PlanCode,
  TenantFeature,
} from '@eticart/shared-types';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';

import { LOGGER_TOKEN } from '../common/logger.js';
import { PlansRepository } from '../plans/plans.repository.js';
import {
  type UpsertTenantFeatureInput,
  FeaturesRepository,
} from './features.repository.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class FeaturesService {
  private readonly repo: FeaturesRepository;
  private readonly plans: PlansRepository;

  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') pool: Pool,
    private readonly audit: AuditService,
  ) {
    this.repo = new FeaturesRepository(pool);
    this.plans = new PlansRepository(pool);
  }

  /** Tenant için tüm override listesi. */
  async listForTenant(tenantId: string): Promise<TenantFeature[]> {
    return this.repo.listByTenant(tenantId);
  }

  /**
   * Verilen özelliğin tenant için etkin olup olmadığını döner.
   */
  async isEnabled(
    tenantId: string,
    featureKey: FeatureKey,
    tenantPlan: PlanCode,
  ): Promise<{ enabled: boolean; limit: number | null; source: 'plan' | 'manual' | 'trial' | 'promotion' | 'none' }> {
    // 1) Override
    const override = await this.repo.findOne(tenantId, featureKey);
    if (
      override &&
      (!override.expiresAt || new Date(override.expiresAt).getTime() > Date.now())
    ) {
      return {
        enabled: override.enabled,
        limit: override.limitValue,
        source: override.source,
      };
    }

    // 2) Paket
    const plan = await this.plans.findByCode(tenantPlan);
    if (!plan) {
      return { enabled: false, limit: null, source: 'none' };
    }
    const features = await this.plans.listFeatures(plan.id);
    const f = features.find((x) => x.featureKey === featureKey);
    if (!f || !f.enabled) {
      return { enabled: false, limit: null, source: 'none' };
    }
    return {
      enabled: true,
      limit: f.limitValue,
      source: 'plan',
    };
  }

  /**
   * Tenant için özellik override ekle veya güncelle.
   */
  async upsertOverride(
    input: {
      tenantId: string;
      featureKey: FeatureKey;
      enabled: boolean;
      limitValue?: number | null;
      source?: 'manual' | 'trial' | 'promotion';
      expiresAt?: Date | null;
    },
    actor: { id: string; email: string } | null,
  ): Promise<TenantFeature> {
    const dbInput: UpsertTenantFeatureInput = {
      tenantId: input.tenantId,
      featureKey: input.featureKey,
      enabled: input.enabled,
      limitValue: input.limitValue ?? null,
      source: input.source ?? 'manual',
      expiresAt: input.expiresAt ?? null,
    };

    const before = await this.repo.findOne(input.tenantId, input.featureKey);
    const after = await this.repo.upsert(dbInput);

    await this.audit.log({
      action: 'feature.upsert',
      resourceType: 'tenant_feature',
      resourceId: after.id,
      tenantId: input.tenantId,
      before: before ? (before as unknown as Record<string, unknown>) : null,
      after: after as unknown as Record<string, unknown>,
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
    });

    return after;
  }

  /** Override sil (özellik yalnızca pakete düşer). */
  async removeOverride(
    tenantId: string,
    featureKey: FeatureKey,
    actor: { id: string; email: string } | null,
  ): Promise<{ removed: boolean }> {
    const before = await this.repo.findOne(tenantId, featureKey);
    if (!before) {
      throw new ApiError(
        404,
        ErrorCode.NOT_FOUND,
        'Bu tenant için override bulunamadı.',
        { tenantId, featureKey },
      );
    }
    const ok = await this.repo.remove(tenantId, featureKey);
    await this.audit.log({
      action: 'feature.remove',
      resourceType: 'tenant_feature',
      resourceId: before.id,
      tenantId,
      before: before as unknown as Record<string, unknown>,
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
    });
    return { removed: ok };
  }
}