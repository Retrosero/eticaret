/**
 * Subscription servisi.
 *
 * Tenant'a plan atama, abonelik iptali, periyot uzatma.
 * Trial süresi dolunca otomatik kontrol (Faz 6 ile birlikte
 * scheduler tarafından tetiklenecek).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  BillingCycle,
  PlanCode,
  TenantSubscription,
  Uuid,
} from '@eticart/shared-types';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';

import { LOGGER_TOKEN } from '../common/logger.js';
import { PlansService } from '../plans/plans.service.js';
import {
  type CreateSubscriptionDbInput,
  SubscriptionsRepository,
} from './subscriptions.repository.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class SubscriptionsService {
  private readonly repo: SubscriptionsRepository;
  private readonly pool: Pool;

  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') pool: Pool,
    private readonly plans: PlansService,
    private readonly audit: AuditService,
  ) {
    this.pool = pool;
    this.repo = new SubscriptionsRepository(pool);
  }

  async getActiveForTenant(tenantId: string): Promise<TenantSubscription | null> {
    return this.repo.findActiveByTenant(tenantId);
  }

  async listForTenant(tenantId: string): Promise<TenantSubscription[]> {
    return this.repo.listByTenant(tenantId);
  }

  /**
   * Tenant için yeni abonelik oluştur. Tenant zaten aktif
   * abonelik taşıyorsa 409 döner.
   */
  async create(
    input: {
      tenantId: Uuid;
      planCode: PlanCode;
      billingCycle: BillingCycle;
      trialDays?: number;
    },
    actor: { id: Uuid; email: string } | null,
  ): Promise<TenantSubscription> {
    const plan = await this.plans.assertPlanExists(input.planCode);

    const existing = await this.repo.findActiveByTenant(input.tenantId);
    if (existing) {
      throw new ApiError(
        409,
        ErrorCode.CONFLICT,
        'Tenant zaten aktif bir abonelik taşıyor.',
        { tenantId: input.tenantId, existingSubscriptionId: existing.id },
      );
    }

    const now = new Date();
    const periodLength = input.billingCycle === 'yearly' ? 365 : 30;
    const trialDays = input.trialDays ?? plan.trialDays;
    const trialEnd =
      trialDays > 0
        ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
        : null;
    const periodEnd = new Date(
      now.getTime() + periodLength * 24 * 60 * 60 * 1000,
    );

    const dbInput: CreateSubscriptionDbInput = {
      tenantId: input.tenantId,
      planId: plan.id,
      billingCycle: input.billingCycle,
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialEndAt: trialEnd,
    };

    const sub = await this.repo.create(dbInput);

    // Tenant plan alanını güncelle
    await this.pool.query(
      `UPDATE public.tenants SET plan = $1 WHERE id = $2`,
      [input.planCode, input.tenantId],
    );

    await this.audit.log({
      action: 'subscription.create',
      resourceType: 'subscription',
      resourceId: sub.id,
      tenantId: input.tenantId,
      after: sub as unknown as Record<string, unknown>,
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
    });

    return sub;
  }

  /** Aboneliği iptal et. `atPeriodEnd=true` ise dönem sonunda iptal. */
  async cancel(
    subscriptionId: Uuid,
    input: { reason?: string; atPeriodEnd: boolean },
    actor: { id: Uuid; email: string } | null,
  ): Promise<TenantSubscription> {
    const before = await this.pool.query<{
      tenant_id: string;
      status: string;
      current_period_end: Date;
    }>(
      `SELECT tenant_id, status, current_period_end FROM public.tenant_subscriptions WHERE id = $1`,
      [subscriptionId],
    );
    const row = before.rows[0];
    if (!row) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Abonelik bulunamadı.', {
        subscriptionId,
      });
    }

    if (input.atPeriodEnd) {
      const sub = await this.repo.update(subscriptionId, {
        status: 'cancelled',
        cancelledAt: row.current_period_end,
      });
      await this.audit.log({
        action: 'subscription.cancel.scheduled',
        resourceType: 'subscription',
        resourceId: subscriptionId,
        tenantId: row.tenant_id,
        before: row as unknown as Record<string, unknown>,
        after: sub as unknown as Record<string, unknown>,
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        metadata: { reason: input.reason ?? null, atPeriodEnd: true },
      });
      return sub;
    }

    const sub = await this.repo.update(subscriptionId, {
      status: 'cancelled',
      cancelledAt: new Date(),
    });
    await this.audit.log({
      action: 'subscription.cancel.immediate',
      resourceType: 'subscription',
      resourceId: subscriptionId,
      tenantId: row.tenant_id,
      after: sub as unknown as Record<string, unknown>,
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      metadata: { reason: input.reason ?? null },
    });
    return sub;
  }

  // Pool'a erişim (subscriptions repository oluşturulurken kullanılır)
}