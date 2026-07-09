/**
 * License repository.
 *
 * Lisans anahtarları `licenses` tablosunda SHA-256 hash olarak
 * saklanır; düz metin **asla** loglanmaz veya audit'e yazılmaz.
 * Aktivasyonlar `license_activations` tablosunda tutulur.
 */

import type { Pool, PoolClient } from 'pg';
import type { License, LicenseActivation, LicenseStatus } from '@eticart/shared-types';

export interface LicenseRow {
  id: string;
  tenant_id: string;
  license_key_hash: string;
  license_key_last4: string;
  product_code: string;
  status: LicenseStatus;
  issued_at: Date;
  expires_at: Date | null;
  max_activations: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export function mapLicenseRow(row: LicenseRow): License {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    licenseKeyHash: row.license_key_hash,
    licenseKeyLast4: row.license_key_last4,
    productCode: row.product_code,
    status: row.status,
    issuedAt: row.issued_at.toISOString(),
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    maxActivations: row.max_activations,
    notes: row.notes,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface LicenseActivationRow {
  id: string;
  license_id: string;
  tenant_id: string;
  activated_at: Date;
  instance_id: string | null;
  instance_host: string | null;
  user_agent: string | null;
  ip_masked: string | null;
  revoked_at: Date | null;
  metadata: Record<string, unknown>;
}

export function mapLicenseActivationRow(
  row: LicenseActivationRow,
): LicenseActivation {
  return {
    id: row.id,
    licenseId: row.license_id,
    tenantId: row.tenant_id,
    activatedAt: row.activated_at.toISOString(),
    instanceId: row.instance_id,
    instanceHost: row.instance_host,
    userAgent: row.user_agent,
    ipMasked: row.ip_masked,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    metadata: row.metadata ?? {},
  };
}

export interface CreateLicenseDbInput {
  tenantId: string;
  licenseKeyHash: string;
  licenseKeyLast4: string;
  productCode: string;
  expiresAt: Date | null;
  maxActivations: number;
  notes: string | null;
}

export class LicensesRepository {
  constructor(private readonly pool: Pool) {}

  async create(
    input: CreateLicenseDbInput,
    runner: Pool | PoolClient = this.pool,
  ): Promise<License> {
    const r = await runner.query<LicenseRow>(
      `INSERT INTO public.licenses (
          tenant_id, license_key_hash, license_key_last4,
          product_code, expires_at, max_activations, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
      [
        input.tenantId,
        input.licenseKeyHash,
        input.licenseKeyLast4,
        input.productCode,
        input.expiresAt,
        input.maxActivations,
        input.notes,
      ],
    );
    return mapLicenseRow(r.rows[0]!);
  }

  async findByHash(hash: string): Promise<License | null> {
    const r = await this.pool.query<LicenseRow>(
      `SELECT * FROM public.licenses WHERE license_key_hash = $1 LIMIT 1`,
      [hash],
    );
    return r.rows[0] ? mapLicenseRow(r.rows[0]) : null;
  }

  async findById(id: string): Promise<License | null> {
    const r = await this.pool.query<LicenseRow>(
      `SELECT * FROM public.licenses WHERE id = $1 LIMIT 1`,
      [id],
    );
    return r.rows[0] ? mapLicenseRow(r.rows[0]) : null;
  }

  async listByTenant(tenantId: string): Promise<License[]> {
    const r = await this.pool.query<LicenseRow>(
      `SELECT * FROM public.licenses
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return r.rows.map(mapLicenseRow);
  }

  async updateStatus(
    id: string,
    status: LicenseStatus,
    runner: Pool | PoolClient = this.pool,
  ): Promise<License> {
    const r = await runner.query<LicenseRow>(
      `UPDATE public.licenses SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id],
    );
    if (!r.rows[0]) throw new Error('Lisans güncellenemedi: ' + id);
    return mapLicenseRow(r.rows[0]);
  }

  async addActivation(
    licenseId: string,
    tenantId: string,
    input: { instanceId: string; instanceHost: string | null; userAgent: string | null; ipMasked: string | null },
    runner: Pool | PoolClient = this.pool,
  ): Promise<LicenseActivation> {
    const r = await runner.query<LicenseActivationRow>(
      `INSERT INTO public.license_activations (
          license_id, tenant_id,
          instance_id, instance_host, user_agent, ip_masked
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
      [
        licenseId,
        tenantId,
        input.instanceId,
        input.instanceHost,
        input.userAgent,
        input.ipMasked,
      ],
    );
    return mapLicenseActivationRow(r.rows[0]!);
  }

  async countActiveActivations(
    licenseId: string,
    runner: Pool | PoolClient = this.pool,
  ): Promise<number> {
    const r = await runner.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM public.license_activations
       WHERE license_id = $1 AND revoked_at IS NULL`,
      [licenseId],
    );
    return Number(r.rows[0]?.count ?? '0');
  }
}