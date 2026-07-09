/**
 * Plan yönetim servisi.
 *
 * Seed verisi `seedPlans()` ile eklenir; runtime'da CRUD uçları
 * `PlansController` üzerinden kullanılır.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  PlanCode,
  PlanFeature,
  SubscriptionPlan,
} from '@eticart/shared-types';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { DEFAULT_PLAN_FEATURES } from '@eticart/shared-types';

import { LOGGER_TOKEN } from '../common/logger.js';
import {
  type UpsertPlanInput,
  PlansRepository,
} from './plans.repository.js';

@Injectable()
export class PlansService {
  private readonly repo: PlansRepository;

  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') pool: Pool,
  ) {
    this.repo = new PlansRepository(pool);
  }

  /** Tüm aktif planları listele. */
  async listActive(): Promise<SubscriptionPlan[]> {
    return this.repo.listActive();
  }

  /** Plan kodu ile detay getir (özellikler dahil). */
  async findWithFeatures(
    code: PlanCode,
  ): Promise<{ plan: SubscriptionPlan; features: PlanFeature[] } | null> {
    return this.repo.findWithFeatures(code);
  }

  /**
   * Plan upsert. Aynı kodla mevcutsa günceller.
   */
  async upsert(
    input: UpsertPlanInput,
  ): Promise<{ plan: SubscriptionPlan; features: PlanFeature[] }> {
    return this.repo.upsert(input);
  }

  /**
   * Varsayılan paket setini seed et. Bu metot idempotent'tir; her
   * çalıştırmada paketler güncellenir, yeni özellikler eklenir,
   * kaldırılanlar silinmez (geriye dönük uyumluluk için).
   */
  async seedDefaults(): Promise<{
    created: number;
    updated: number;
  }> {
    const defaults: UpsertPlanInput[] = [
      {
        code: 'starter',
        name: 'Starter',
        description: 'Yeni başlayanlar için temel e-ticaret paketi.',
        monthlyPriceKurus: 0,
        yearlyPriceKurus: 0,
        currency: 'TRY',
        trialDays: 14,
        maxUsers: 2,
        maxProducts: 100,
        maxOrdersPerMonth: 500,
        maxStorageBytes: 1 * 1024 * 1024 * 1024,
        sortOrder: 10,
        isActive: true,
        features: this.expandDefaultFeatures('starter'),
      },
      {
        code: 'growth',
        name: 'Growth',
        description: 'Büyüyen işletmeler için gelişmiş özellikler.',
        monthlyPriceKurus: 49900,
        yearlyPriceKurus: 499000,
        currency: 'TRY',
        trialDays: 14,
        maxUsers: 10,
        maxProducts: 5000,
        maxOrdersPerMonth: 10_000,
        maxStorageBytes: 10 * 1024 * 1024 * 1024,
        sortOrder: 20,
        isActive: true,
        features: this.expandDefaultFeatures('growth'),
      },
      {
        code: 'business',
        name: 'Pro',
        description: 'Profesyonel e-ticaret operasyonları için tam paket.',
        monthlyPriceKurus: 149900,
        yearlyPriceKurus: 1_499_000,
        currency: 'TRY',
        trialDays: 14,
        maxUsers: 50,
        maxProducts: 50_000,
        maxOrdersPerMonth: 100_000,
        maxStorageBytes: 50 * 1024 * 1024 * 1024,
        sortOrder: 30,
        isActive: true,
        features: this.expandDefaultFeatures('business'),
      },
      {
        code: 'enterprise',
        name: 'Enterprise',
        description: 'Büyük ölçekli işletmeler için sınırsız paket.',
        monthlyPriceKurus: 0, // özel fiyat
        yearlyPriceKurus: 0,
        currency: 'TRY',
        trialDays: 30,
        maxUsers: 9999,
        maxProducts: 999_999,
        maxOrdersPerMonth: 999_999,
        maxStorageBytes: 1024 * 1024 * 1024 * 1024,
        sortOrder: 40,
        isActive: true,
        features: this.expandDefaultFeatures('enterprise'),
      },
    ];

    let created = 0;
    let updated = 0;
    for (const plan of defaults) {
      const exists = await this.repo.findByCode(plan.code);
      await this.repo.upsert(plan);
      if (exists) {
        updated++;
      } else {
        created++;
      }
    }

    this.logger.info(
      { created, updated },
      'Paket seed verisi senkronize edildi',
    );
    return { created, updated };
  }

  /**
   * Tenant plan kodunun geçerli olup olmadığını doğrular.
   */
  async assertPlanExists(code: PlanCode): Promise<SubscriptionPlan> {
    const plan = await this.repo.findByCode(code);
    if (!plan) {
      throw new ApiError(
        404,
        ErrorCode.NOT_FOUND,
        'Paket bulunamadı.',
        { code },
      );
    }
    if (!plan.isActive) {
      throw new ApiError(
        409,
        ErrorCode.CONFLICT,
        'Paket aktif değil.',
        { code },
      );
    }
    return plan;
  }

  // -------------------------------------------------------------------
  // Dahili
  // -------------------------------------------------------------------

  private expandDefaultFeatures(
    code: PlanCode,
  ): Array<{ featureKey: string; enabled: boolean; limitValue: number | null }> {
    const keys = DEFAULT_PLAN_FEATURES[code];
    return keys.map((featureKey) => ({
      featureKey,
      enabled: true,
      limitValue: null,
    }));
  }
}