/**
 * Tenant iş mantığı katmanı.
 *
 * Sorumluluklar:
 *   - Yeni tenant oluşturma, güncelleme, askıya alma, yeniden aktif etme
 *   - Slug benzersizliği ve domain çakışması kontrolleri
 *   - Status geçiş kuralları (allowed transitions)
 *   - Audit log tetikleme (status değişikliği)
 *   - Soft delete / arşivleme
 *
 * Yan etkiler:
 *   - tenant_status_history tablosuna satır eklenir
 *   - audit_logs tablosuna satır eklenir (audit service üzerinden)
 *   - provision_job tetiklenir (status 'draft' → 'provisioning')
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Tenant, TenantStatus, Uuid } from '@eticart/shared-types';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';

import { LOGGER_TOKEN } from '../common/logger.js';
import {
  type ListTenantsFilter,
  type TenantCreateInput,
  type TenantUpdateInput,
  TenantsRepository,
} from './tenants.repository.js';
import { maskMail } from '../shared/masking.js';
import { AuditService } from '../audit/audit.service.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';

/** İzin verilen status geçişleri. */
const ALLOWED_TRANSITIONS: Readonly<Record<TenantStatus, ReadonlyArray<TenantStatus>>> = {
  draft: ['provisioning', 'cancelled', 'archived'],
  provisioning: ['trial', 'active', 'provisioning_failed', 'cancelled', 'archived'],
  trial: ['active', 'overdue', 'suspended', 'cancelled', 'archived'],
  active: ['overdue', 'suspended', 'cancelled', 'archived'],
  overdue: ['active', 'suspended', 'cancelled', 'archived'],
  suspended: ['active', 'cancelled', 'archived'],
  cancelled: ['archived'],
  archived: [],
  provisioning_failed: ['provisioning', 'cancelled', 'archived'],
};

@Injectable()
export class TenantsService {
  private readonly repo: TenantsRepository;

  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') pool: Pool,
    private readonly audit: AuditService,
    private readonly provisioning: ProvisioningService,
  ) {
    this.repo = new TenantsRepository(pool);
  }

  /**
   * Repository'ye doğrudan erişim gereken test veya başka modüller
   * için (örn: domains modülü, primary domain kontrolü).
   */
  getRepository(): TenantsRepository {
    return this.repo;
  }

  // -------------------------------------------------------------------
  // Oluşturma
  // -------------------------------------------------------------------

  /**
   * Yeni tenant oluşturur. Slug benzersiz olmalı; primary domain
   * başka bir tenant tarafından kullanılmamalıdır.
   *
   * Akış:
   *  1) Slug benzersizlik kontrolü
   *  2) Domain çakışması kontrolü (verilmişse)
   *  3) Tenant satırı eklenir (status=draft)
   *  4) tenant_status_history kaydı
   *  5) Otomatik provision job tetiklenir
   *  6) Audit log
   */
  async create(
    input: {
      slug: string;
      name: string;
      plan: Tenant['plan'];
      primaryDomain?: string | null;
      ownerEmail?: string | null;
      metadata?: Record<string, unknown>;
      region?: string | null;
      locale?: string;
      currency?: string;
      trialDays?: number;
      idempotencyKey?: string;
    },
    actor: { id: Uuid; email: string } | null,
  ): Promise<Tenant> {
    this.logger.info({ slug: input.slug }, 'Tenant oluşturma isteği alındı');

    // Slug benzersizlik kontrolü
    const existing = await this.repo.findBySlug(input.slug);
    if (existing && !existing.deletedAt) {
      throw new ApiError(
        409,
        ErrorCode.CONFLICT,
        'Bu slug ile kayıtlı bir tenant zaten var.',
        { slug: input.slug },
      );
    }

    // Domain çakışması kontrolü
    if (input.primaryDomain) {
      const conflict = await this.repo.findByPrimaryDomain(input.primaryDomain);
      if (conflict && conflict.id !== existing?.id) {
        throw new ApiError(
          409,
          ErrorCode.CONFLICT,
          'Bu alan adı başka bir tenant tarafından kullanılıyor.',
          { domain: input.primaryDomain },
        );
      }
    }

    const maskedEmail = input.ownerEmail ? maskMail(input.ownerEmail) : null;
    const metadata: Record<string, unknown> = {
      ...(input.metadata ?? {}),
    };
    if (input.ownerEmail) {
      metadata['ownerEmail'] = input.ownerEmail.trim().toLowerCase();
    }

    const createInput: TenantCreateInput = {
      slug: input.slug,
      name: input.name,
      plan: input.plan,
      primaryDomain: input.primaryDomain ?? null,
      trialDays: input.trialDays ?? 14,
      ownerEmailMasked: maskedEmail,
      region: input.region ?? null,
      locale: input.locale ?? 'tr-TR',
      currency: input.currency ?? 'TRY',
      metadata,
      idempotencyKey: input.idempotencyKey ?? null,
    };

    const tenant = await this.repo.create(createInput);

    // Default ayarlar satırı oluştur
    await this.ensureSettings(tenant.id);

    // Status geçmişi
    await this.recordStatusHistory(tenant.id, null, tenant.status, 'tenant oluşturuldu');

    // Otomatik provision işi
    await this.provisioning.enqueue({
      tenantId: tenant.id,
      idempotencyKey: `tenant:${tenant.id}:initial-provision`,
      triggeredBy: actor?.id ?? null,
      maxAttempts: 3,
    });

    // Audit
    await this.audit.log({
      action: 'tenant.create',
      resourceType: 'tenant',
      resourceId: tenant.id,
      after: tenant as unknown as Record<string, unknown>,
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
    });

    this.logger.info(
      { tenantId: tenant.id, slug: tenant.slug },
      'Tenant oluşturuldu',
    );

    return tenant;
  }

  // -------------------------------------------------------------------
  // Okuma
  // -------------------------------------------------------------------

  /** Tek tenant getir. */
  async findById(id: string): Promise<Tenant | null> {
    return this.repo.findById(id);
  }

  /** Slug ile tek tenant getir. */
  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.repo.findBySlug(slug);
  }

  /** Sayfalı liste. */
  async list(filter: ListTenantsFilter): Promise<{
    items: Tenant[];
    pageInfo: { page: number; pageSize: number; total: number };
  }> {
    const r = await this.repo.list(filter);
    return {
      items: r.items,
      pageInfo: {
        page: filter.page,
        pageSize: filter.pageSize,
        total: r.total,
      },
    };
  }

  // -------------------------------------------------------------------
  // Güncelleme
  // -------------------------------------------------------------------

  /** Tenant güncelle; status değişirse geçiş kuralına uygunluk kontrol edilir. */
  async update(
    id: string,
    patch: TenantUpdateInput,
    actor: { id: Uuid; email: string } | null,
  ): Promise<Tenant> {
    const before = await this.repo.findById(id);
    if (!before || before.deletedAt) {
      throw new ApiError(
        404,
        ErrorCode.NOT_FOUND,
        'Tenant bulunamadı.',
        { id },
      );
    }

    // Status geçişi kuralı
    if (patch.status && patch.status !== before.status) {
      const allowed = ALLOWED_TRANSITIONS[before.status];
      if (!allowed.includes(patch.status)) {
        throw new ApiError(
          409,
          ErrorCode.CONFLICT,
          'Bu status geçişine izin verilmiyor.',
          {
            from: before.status,
            to: patch.status,
            allowed,
          },
        );
      }
    }

    const { before: b, after } = await this.repo.update(id, patch);

    if (patch.status && patch.status !== b.status) {
      await this.recordStatusHistory(
        id,
        b.status,
        after.status,
        patch.suspendedReason ?? null,
      );
    }

    await this.audit.log({
      action: 'tenant.update',
      resourceType: 'tenant',
      resourceId: id,
      before: b as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
    });

    return after;
  }

  // -------------------------------------------------------------------
  // Yaşam döngüsü uçları
  // -------------------------------------------------------------------

  /** Askıya al. */
  async suspend(
    id: string,
    reason: string,
    actor: { id: Uuid; email: string } | null,
  ): Promise<Tenant> {
    return this.update(
      id,
      { status: 'suspended', suspendedReason: reason },
      actor,
    );
  }

  /** Yeniden aktif et. */
  async reactivate(
    id: string,
    actor: { id: Uuid; email: string } | null,
  ): Promise<Tenant> {
    return this.update(
      id,
      { status: 'active', suspendedReason: null },
      actor,
    );
  }

  /** Soft delete ile arşivle. */
  async archive(
    id: string,
    actor: { id: Uuid; email: string } | null,
  ): Promise<Tenant> {
    const t = await this.repo.findById(id);
    if (!t || t.deletedAt) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tenant bulunamadı.', { id });
    }
    const before = t;
    const after = await this.repo.softDelete(id);
    await this.recordStatusHistory(id, before.status, 'archived', 'soft delete');
    await this.audit.log({
      action: 'tenant.archive',
      resourceType: 'tenant',
      resourceId: id,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
    });
    return after;
  }

  // -------------------------------------------------------------------
  // Dahili yardımcılar
  // -------------------------------------------------------------------

  /** Default tenant_settings satırı oluştur. */
  private async ensureSettings(tenantId: string): Promise<void> {
    const pool: Pool = (this.repo as unknown as { pool: Pool }).pool;
    await pool.query(
      `INSERT INTO public.tenant_settings (tenant_id)
       VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );
    await pool.query(
      `INSERT INTO public.tenant_usage (tenant_id)
       VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );
  }

  /** Status geçmişi kaydı. */
  private async recordStatusHistory(
    tenantId: string,
    fromStatus: TenantStatus | null,
    toStatus: TenantStatus,
    reason: string | null,
  ): Promise<void> {
    const pool: Pool = (this.repo as unknown as { pool: Pool }).pool;
    await pool.query(
      `INSERT INTO public.tenant_status_history
       (tenant_id, from_status, to_status, reason, actor_type)
       VALUES ($1, $2, $3, $4, 'system')`,
      [tenantId, fromStatus, toStatus, reason],
    );
  }
}
