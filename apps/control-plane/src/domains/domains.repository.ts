/**
 * Domain repository.
 *
 * `public.tenant_domains` tablosu üzerinde çalışır. Service
 * katmanı için tüm domain sorgularını ve mutation'ları
 * burada toplar.
 */

import type { Pool, PoolClient } from 'pg';
import type {
  DomainVerificationMethod,
  DomainVerificationStatus,
  TenantDomain,
  TenantDomainType,
} from '@eticart/shared-types';

export interface DomainRow {
  id: string;
  tenant_id: string;
  domain: string;
  type: TenantDomainType;
  is_primary: boolean;
  verification_status: DomainVerificationStatus;
  verification_token: string | null;
  verification_method: DomainVerificationMethod | null;
  verified_at: Date | null;
  last_checked_at: Date | null;
  created_at: Date;
}

export function mapDomainRow(row: DomainRow): TenantDomain {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    domain: row.domain,
    type: row.type,
    isPrimary: row.is_primary,
    verificationStatus: row.verification_status,
    verificationToken: row.verification_token,
    verificationMethod: row.verification_method,
    verifiedAt: row.verified_at ? row.verified_at.toISOString() : null,
    lastCheckedAt: row.last_checked_at ? row.last_checked_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

export interface AddDomainInput {
  tenantId: string;
  domain: string;
  type: TenantDomainType;
  isPrimary: boolean;
  verificationToken: string;
  verificationMethod: DomainVerificationMethod;
}

export class DomainsRepository {
  constructor(private readonly pool: Pool) {}

  /** Tüm tenant domainleri listele. */
  async listByTenant(tenantId: string): Promise<TenantDomain[]> {
    const r = await this.pool.query<DomainRow>(
      `SELECT * FROM public.tenant_domains
       WHERE tenant_id = $1
       ORDER BY is_primary DESC, created_at ASC`,
      [tenantId],
    );
    return r.rows.map(mapDomainRow);
  }

  /** Tenant domainine göre tek kayıt. */
  async findByDomain(domain: string): Promise<TenantDomain | null> {
    const r = await this.pool.query<DomainRow>(
      `SELECT * FROM public.tenant_domains
       WHERE domain = $1
       LIMIT 1`,
      [domain],
    );
    return r.rows[0] ? mapDomainRow(r.rows[0]) : null;
  }

  /**
   * Domain ekle. Eğer aynı domain başka bir tenant'a bağlıysa
   * hata fırlatır. Bir tenant'ın birden fazla domain'i olabilir.
   */
  async add(
    input: AddDomainInput,
    runner: Pool | PoolClient = this.pool,
  ): Promise<TenantDomain> {
    const existing = await this.findByDomain(input.domain);
    if (existing && existing.tenantId !== input.tenantId) {
      const err = new Error(
        `Bu alan adı başka bir tenant tarafından kullanılıyor: ${input.domain}`,
      );
      (err as Error & { code?: string }).code = 'DOMAIN_CONFLICT';
      throw err;
    }

    if (input.isPrimary) {
      // Önce diğer primary'leri kaldır
      await runner.query(
        `UPDATE public.tenant_domains
         SET is_primary = FALSE
         WHERE tenant_id = $1 AND is_primary = TRUE`,
        [input.tenantId],
      );
      // Tenant primary_domain güncelle
      await runner.query(
        `UPDATE public.tenants
         SET primary_domain = $1
         WHERE id = $2`,
        [input.domain, input.tenantId],
      );
    }

    if (existing && existing.tenantId === input.tenantId) {
      // Aynı tenant için güncelle
      const r = await runner.query<DomainRow>(
        `UPDATE public.tenant_domains
         SET type = $1, is_primary = $2,
             verification_token = $3, verification_method = $4,
             verification_status = 'pending',
             verified_at = NULL
         WHERE id = $5
         RETURNING *`,
        [
          input.type,
          input.isPrimary,
          input.verificationToken,
          input.verificationMethod,
          existing.id,
        ],
      );
      return mapDomainRow(r.rows[0]!);
    }

    const r = await runner.query<DomainRow>(
      `INSERT INTO public.tenant_domains (
          tenant_id, domain, type, is_primary,
          verification_status, verification_token, verification_method
        ) VALUES ($1, $2, $3, $4, 'pending', $5, $6)
        RETURNING *`,
      [
        input.tenantId,
        input.domain,
        input.type,
        input.isPrimary,
        input.verificationToken,
        input.verificationMethod,
      ],
    );
    return mapDomainRow(r.rows[0]!);
  }

  /** Domain doğrulama durumunu güncelle. */
  async updateVerificationStatus(
    domainId: string,
    status: DomainVerificationStatus,
    runner: Pool | PoolClient = this.pool,
  ): Promise<TenantDomain> {
    const r = await runner.query<DomainRow>(
      `UPDATE public.tenant_domains
       SET verification_status = $1,
           verified_at = CASE WHEN $1 = 'verified' THEN NOW() ELSE verified_at END,
           last_checked_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, domainId],
    );
    if (!r.rows[0]) {
      throw new Error(`Domain güncellenemedi: ${domainId}`);
    }
    return mapDomainRow(r.rows[0]);
  }

  /** Domain sil. */
  async remove(
    domainId: string,
    runner: Pool | PoolClient = this.pool,
  ): Promise<void> {
    await runner.query(
      `DELETE FROM public.tenant_domains WHERE id = $1`,
      [domainId],
    );
  }
}