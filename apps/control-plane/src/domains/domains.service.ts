/**
 * Domain yönetim servisi.
 *
 * Sorumluluklar:
 *   - Tenant'a subdomain ve özel domain ekleme
 *   - Domain doğrulama (DNS TXT kaydı kontrolü simülasyonu)
 *   - Domain benzersizlik kontrolü (unique constraint + service check)
 *   - Birincil domain yönetimi
 *
 * Not: Faz 2'de gerçek DNS sorgusu yapılmaz; `verify()` metodu
 * simülasyon olarak doğrulama token'ının doğru gelip gelmediğini
 * kontrol eder. Production'da burada `node-dns` veya HTTP-based
 * DNS-over-HTTPS kullanılabilir.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { TenantDomain, Uuid } from '@eticart/shared-types';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { createHash, randomBytes } from 'node:crypto';

import { LOGGER_TOKEN } from '../common/logger.js';
import {
  type AddDomainInput,
  DomainsRepository,
} from './domains.repository.js';
import { TenantsRepository } from '../tenants/tenants.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { isValidSlug, buildSubdomain } from '../shared/slug.js';

@Injectable()
export class DomainsService {
  private readonly domainRepo: DomainsRepository;
  private readonly tenants: TenantsRepository;
  private readonly pool: Pool;

  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') pool: Pool,
    private readonly audit: AuditService,
  ) {
    this.pool = pool;
    this.domainRepo = new DomainsRepository(pool);
    this.tenants = new TenantsRepository(pool);
  }

  /** Dahili kullanım. */
  getRepository(): DomainsRepository {
    return this.domainRepo;
  }

  /**
   * Tenant'ın domain listesini getir.
   */
  async listForTenant(tenantId: string): Promise<TenantDomain[]> {
    return this.domainRepo.listByTenant(tenantId);
  }

  /**
   * Otomatik subdomain oluştur ve ekle. Tenant slug'ı ve
   * `PLATFORM_BASE_DOMAIN` env değişkeni kullanılır.
   *
   * Bu metot provision sürecinin bir parçası olarak çağrılır;
   * tek başına da kullanılabilir.
   */
  async provisionSubdomain(
    tenantId: string,
    baseDomain: string,
  ): Promise<TenantDomain> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tenant bulunamadı.', { tenantId });
    }
    if (!isValidSlug(tenant.slug)) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Tenant slug formatı geçersiz; subdomain üretilemiyor.',
        { slug: tenant.slug },
      );
    }
    const subdomain = buildSubdomain(tenant.slug, baseDomain);
    if (!subdomain) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Subdomain üretilemedi.',
        { baseDomain },
      );
    }

    const token = this.generateVerificationToken(tenant.id, subdomain);

    return this.domainRepo.add({
      tenantId,
      domain: subdomain,
      type: 'subdomain',
      isPrimary: true,
      verificationToken: token,
      verificationMethod: 'dns_txt',
    });
  }

  /**
   * Özel domain ekle. Domain zaten başka bir tenant'a bağlıysa
   * 409 döner.
   */
  async addCustomDomain(
    tenantId: string,
    input: {
      domain: string;
      method?: 'dns_txt' | 'dns_cname';
      isPrimary?: boolean;
    },
    actor: { id: Uuid; email: string } | null,
  ): Promise<TenantDomain> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tenant bulunamadı.', { tenantId });
    }

    const conflict = await this.domainRepo.findByDomain(input.domain);
    if (conflict && conflict.tenantId !== tenantId) {
      throw new ApiError(
        409,
        ErrorCode.CONFLICT,
        'Bu alan adı başka bir tenant tarafından kullanılıyor.',
        { domain: input.domain, ownerTenantId: conflict.tenantId },
      );
    }

    const token = this.generateVerificationToken(tenantId, input.domain);

    const addInput: AddDomainInput = {
      tenantId,
      domain: input.domain,
      type: 'custom',
      isPrimary: input.isPrimary ?? false,
      verificationToken: token,
      verificationMethod: input.method ?? 'dns_txt',
    };

    const before = conflict;
    const after = await this.domainRepo.add(addInput);

    await this.audit.log({
      action: 'domain.add',
      resourceType: 'domain',
      resourceId: after.id,
      tenantId,
      before: before ? (before as unknown as Record<string, unknown>) : null,
      after: after as unknown as Record<string, unknown>,
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
    });

    return after;
  }

  /**
   * Domain doğrulama. Faz 2'de sahte doğrulama: eğer `expectedToken`
   * ile `verification_token` eşleşirse domain verified olur.
   *
   * Production'da burası `node-dns` veya bir HTTPS üzerinden TXT
   * kaydı sorgusu yapacak.
   */
  async verifyDomain(
    domainId: string,
    expectedToken: string,
    actor: { id: Uuid; email: string } | null,
  ): Promise<TenantDomain> {
    const list = await this.pool.query<{
      id: string;
      tenant_id: string;
      domain: string;
      verification_token: string | null;
    }>(
      `SELECT id, tenant_id, domain, verification_token
       FROM public.tenant_domains
       WHERE id = $1`,
      [domainId],
    );
    const row = list.rows[0];
    if (!row) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Domain bulunamadı.', { domainId });
    }
    if (!row.verification_token) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Domain için doğrulama token üretilmemiş.',
      );
    }
    if (row.verification_token !== expectedToken) {
      await this.domainRepo.updateVerificationStatus(domainId, 'failed');
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'Doğrulama token eşleşmedi.',
      );
    }
    const updated = await this.domainRepo.updateVerificationStatus(
      domainId,
      'verified',
    );
    await this.audit.log({
      action: 'domain.verify',
      resourceType: 'domain',
      resourceId: domainId,
      tenantId: row.tenant_id,
      after: updated as unknown as Record<string, unknown>,
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
    });
    return updated;
  }

  /**
   * Domain sil. Primary domain ise `is_primary` durumunu temizler.
   */
  async remove(
    domainId: string,
    actor: { id: Uuid; email: string } | null,
  ): Promise<void> {
    const list = await this.pool.query<{
      id: string;
      tenant_id: string;
      domain: string;
      is_primary: boolean;
    }>(
      `SELECT id, tenant_id, domain, is_primary FROM public.tenant_domains WHERE id = $1`,
      [domainId],
    );
    const row = list.rows[0];
    if (!row) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Domain bulunamadı.', { domainId });
    }
    await this.domainRepo.remove(domainId);
    if (row.is_primary) {
      await this.pool.query(
        `UPDATE public.tenants SET primary_domain = NULL WHERE id = $1`,
        [row.tenant_id],
      );
    }
    await this.audit.log({
      action: 'domain.remove',
      resourceType: 'domain',
      resourceId: domainId,
      tenantId: row.tenant_id,
      before: { id: row.id, domain: row.domain },
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
    });
  }

  // -------------------------------------------------------------------
  // Dahili
  // -------------------------------------------------------------------

  /**
   * Tenant + domain için deterministik + rastgele karışık doğrulama
   * token'ı üretir. Token formatı: `<tenantId-prefix>-<random-hex>`.
   */
  private generateVerificationToken(tenantId: string, domain: string): string {
    const tenantPrefix = tenantId.replace(/-/g, '').slice(0, 8);
    const domainHash = createHash('sha256')
      .update(`${tenantId}:${domain}`)
      .digest('hex')
      .slice(0, 8);
    const nonce = randomBytes(8).toString('hex');
    return `eticart-verify-${tenantPrefix}-${domainHash}-${nonce}`;
  }
}