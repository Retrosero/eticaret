/**
 * Tenant repository.
 *
 * Tüm sorgular bu katmandan geçer. Service katmanı doğrudan
 * SQL yazmaz; böylece testlerde bu sınıf mock'lanabilir veya
 * in-memory adapter ile değiştirilebilir.
 *
 * `pg.Pool` veya bir `PoolClient` (transaction içinde) kabul eder;
 * ikinci parametre olarak `runner` alan metotlar otomatik olarak
 * doğru bağlantıyı kullanır.
 */

import type { Pool, PoolClient } from 'pg';
import type {
  Tenant,
  TenantStatus,
  PlanCode,
} from '@eticart/shared-types';

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  plan: PlanCode;
  primary_domain: string | null;
  trial_end_at: Date | null;
  suspended_reason: string | null;
  region: string | null;
  locale: string;
  currency: string;
  owner_email_masked: string | null;
  tax_id_masked: string | null;
  contact_phone_masked: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/** Row -> domain mapper. */
export function mapTenantRow(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    plan: row.plan,
    primaryDomain: row.primary_domain,
    trialEndAt: row.trial_end_at ? row.trial_end_at.toISOString() : null,
    suspendedReason: row.suspended_reason,
    region: row.region,
    locale: row.locale,
    currency: row.currency,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    metadata: row.metadata ?? {},
  };
}

export interface TenantCreateInput {
  slug: string;
  name: string;
  plan: PlanCode;
  primaryDomain: string | null;
  trialDays: number;
  ownerEmailMasked: string | null;
  region: string | null;
  locale: string;
  currency: string;
  metadata: Record<string, unknown>;
  idempotencyKey: string | null;
}

export interface TenantUpdateInput {
  name?: string;
  status?: TenantStatus;
  plan?: PlanCode;
  primaryDomain?: string | null;
  region?: string | null;
  locale?: string;
  currency?: string;
  suspendedReason?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ListTenantsFilter {
  status?: TenantStatus;
  plan?: PlanCode;
  search?: string;
  includeArchived: boolean;
  page: number;
  pageSize: number;
}

export interface ListTenantsResult {
  items: Tenant[];
  total: number;
}

export class TenantsRepository {
  constructor(private readonly pool: Pool) {}

  /** Slug ile tek tenant getir (soft-delete dahil). */
  async findBySlug(slug: string): Promise<Tenant | null> {
    const r = await this.pool.query<TenantRow>(
      `SELECT * FROM public.tenants WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    return r.rows[0] ? mapTenantRow(r.rows[0]) : null;
  }

  /** ID ile tek tenant getir. */
  async findById(id: string): Promise<Tenant | null> {
    const r = await this.pool.query<TenantRow>(
      `SELECT * FROM public.tenants WHERE id = $1 LIMIT 1`,
      [id],
    );
    return r.rows[0] ? mapTenantRow(r.rows[0]) : null;
  }

  /** Birincil domain ile tenant getir (yalnızca verified). */
  async findByPrimaryDomain(domain: string): Promise<Tenant | null> {
    const r = await this.pool.query<TenantRow>(
      `SELECT t.* FROM public.tenants t
       WHERE t.primary_domain = $1
         AND t.deleted_at IS NULL
       LIMIT 1`,
      [domain],
    );
    return r.rows[0] ? mapTenantRow(r.rows[0]) : null;
  }

  /**
   * Tenant oluştur. `idempotencyKey` sağlanırsa aynı anahtarla
   * gelen istek mevcut kaydı döner (HTTP idempotency).
   */
  async create(
    input: TenantCreateInput,
    runner: Pool | PoolClient = this.pool,
  ): Promise<Tenant> {
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey, runner);
      if (existing) return existing;
    }

    const trialEnd = new Date(Date.now() + input.trialDays * 24 * 60 * 60 * 1000);

    const r = await runner.query<TenantRow>(
      `INSERT INTO public.tenants (
        slug, name, status, plan, primary_domain,
        trial_end_at, owner_email_masked, region, locale, currency,
        metadata, deleted_at
      ) VALUES (
        $1, $2, 'draft', $3, $4,
        $5, $6, $7, $8, $9,
        $10::jsonb, NULL
      )
      RETURNING *`,
      [
        input.slug,
        input.name,
        input.plan,
        input.primaryDomain,
        trialEnd,
        input.ownerEmailMasked,
        input.region,
        input.locale,
        input.currency,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    if (input.idempotencyKey) {
      await this.rememberIdempotency(
        input.idempotencyKey,
        'create_tenant',
        r.rows[0]!.id,
        runner,
      );
    }

    return mapTenantRow(r.rows[0]!);
  }

  /**
   * Tenant güncelle (partial). Sadece sağlanan alanlar değişir.
   * `before` ve `after` snapshot'ları döner (audit log için).
   */
  async update(
    id: string,
    patch: TenantUpdateInput,
    runner: Pool | PoolClient = this.pool,
  ): Promise<{ before: Tenant; after: Tenant }> {
    const before = await this.findById(id);
    if (!before) {
      throw new Error(`Tenant bulunamadı: ${id}`);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (patch.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(patch.name);
    }
    if (patch.status !== undefined) {
      fields.push(`status = $${i++}`);
      values.push(patch.status);
    }
    if (patch.plan !== undefined) {
      fields.push(`plan = $${i++}`);
      values.push(patch.plan);
    }
    if (patch.primaryDomain !== undefined) {
      fields.push(`primary_domain = $${i++}`);
      values.push(patch.primaryDomain);
    }
    if (patch.region !== undefined) {
      fields.push(`region = $${i++}`);
      values.push(patch.region);
    }
    if (patch.locale !== undefined) {
      fields.push(`locale = $${i++}`);
      values.push(patch.locale);
    }
    if (patch.currency !== undefined) {
      fields.push(`currency = $${i++}`);
      values.push(patch.currency);
    }
    if (patch.suspendedReason !== undefined) {
      fields.push(`suspended_reason = $${i++}`);
      values.push(patch.suspendedReason);
    }
    if (patch.metadata !== undefined) {
      fields.push(`metadata = $${i++}::jsonb`);
      values.push(JSON.stringify(patch.metadata));
    }

    if (fields.length === 0) {
      return { before, after: before };
    }

    values.push(id);
    const r = await runner.query<TenantRow>(
      `UPDATE public.tenants SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING *`,
      values,
    );

    return { before, after: mapTenantRow(r.rows[0]!) };
  }

  /** Soft delete. */
  async softDelete(
    id: string,
    runner: Pool | PoolClient = this.pool,
  ): Promise<Tenant> {
    const r = await runner.query<TenantRow>(
      `UPDATE public.tenants
       SET deleted_at = NOW(), status = 'archived'
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    if (!r.rows[0]) {
      throw new Error(`Tenant silinemedi: ${id}`);
    }
    return mapTenantRow(r.rows[0]);
  }

  /** Sayfalı tenant listesi. */
  async list(filter: ListTenantsFilter): Promise<ListTenantsResult> {
    const conds: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (!filter.includeArchived) {
      conds.push('deleted_at IS NULL');
    }
    if (filter.status) {
      conds.push(`status = $${i++}`);
      vals.push(filter.status);
    }
    if (filter.plan) {
      conds.push(`plan = $${i++}`);
      vals.push(filter.plan);
    }
    if (filter.search) {
      conds.push(`(name ILIKE $${i} OR slug ILIKE $${i})`);
      vals.push(`%${filter.search}%`);
      i++;
    }

    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const offset = (filter.page - 1) * filter.pageSize;

    const itemsRes = await this.pool.query<TenantRow>(
      `SELECT * FROM public.tenants ${where}
       ORDER BY created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...vals, filter.pageSize, offset],
    );
    const totalRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM public.tenants ${where}`,
      vals,
    );

    return {
      items: itemsRes.rows.map(mapTenantRow),
      total: Number(totalRes.rows[0]?.count ?? '0'),
    };
  }

  // -------------------------------------------------------------------
  // Idempotency — basit tablo kullanır
  // -------------------------------------------------------------------

  private async findByIdempotencyKey(
    key: string,
    runner: Pool | PoolClient,
  ): Promise<Tenant | null> {
    const r = await runner.query<{ resource_id: string }>(
      `SELECT resource_id FROM public._idempotency_keys
       WHERE key = $1 AND action = 'create_tenant'`,
      [key],
    );
    const id = r.rows[0]?.resource_id;
    if (!id) return null;
    return this.findById(id);
  }

  private async rememberIdempotency(
    key: string,
    action: string,
    resourceId: string,
    runner: Pool | PoolClient,
  ): Promise<void> {
    await runner.query(
      `INSERT INTO public._idempotency_keys (key, action, resource_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (key, action) DO NOTHING`,
      [key, action, resourceId],
    );
  }
}