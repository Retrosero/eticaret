/**
 * Domain → tenant çözümleyici iskeleti.
 *
 * Faz 2'de Postgre `pg_control` ile gerçek veriye bağlanacak; Faz 1'de
 * yalnızca domain biçimlendirme ve slug'dan şema üretme fonksiyonları vardır.
 *
 * KRİTİK GÜVENLİK NOTU: `x-tenant-id` benzeri istemci başlıklarına
 * asla güvenilmez. Yalnızca `Host` (sunucu tarafı doğrulanmış) kabul edilir.
 *
 * @module resolver
 */

import type { TenantContext } from '@eticart/shared-types';

/** DOMAIN_REGEX: https?:// öneki olmadan, sadece host. */
const HOST_REGEX = /^[a-z0-9](?:[a-z0-9.-]{0,253}[a-z0-9])?$/i;

/** `Host` başlığını güvenli kabul etmek için normalize eder. */
export function normalizeHost(rawHost: string | undefined): string | null {
  if (!rawHost) return null;
  const trimmed = rawHost.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 253) return null;
  // IPv6 köşeli parantez içinde olabilir
  const hostNoPort = trimmed.split(':')[0];
  if (!hostNoPort || !HOST_REGEX.test(hostNoPort)) return null;
  return hostNoPort;
}

/**
 * Slug'dan güvenli şema adı üretir.
 *  - sadece `[a-z0-9_]` karakterlerine izin verir
 *  - tireleri alt çizgiye çevirir
 *  - "tenant_" öneki ekler
 *
 * Bilinmeyen / güvensiz slug için `null` döner.
 */
export function schemaNameFromSlug(slug: string): string | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const safe = slug.replace(/-/g, '_');
  if (!/^[a-z0-9_]+$/.test(safe)) return null;
  return `tenant_${safe}`;
}

/**
 * Resolve sonucu — resolver henüz kalıcı veriye bağlı değil.
 *
 * Faz 2'de: `pg_control.tenants` + `tenant_domains` sorgulanır.
 *
 * Şimdilik: `domains` Map'inde yapılan basit arama yeterlidir.
 */
export interface TenantResolver {
  /** Host'tan tenant bağlamını çözümler. Bulunamazsa null. */
  resolve(host: string): Promise<TenantContext | null>;
}

/** In-memory sahte resolver — yalnızca Faz 1 testleri için. */
export class InMemoryTenantResolver implements TenantResolver {
  private readonly domains: ReadonlyMap<string, TenantContext>;

  constructor(domains: Iterable<readonly [string, TenantContext]>) {
    this.domains = new Map(
      Array.from(domains, ([host, ctx]) => [host.toLowerCase(), ctx]),
    );
  }

  async resolve(host: string): Promise<TenantContext | null> {
    const normalized = normalizeHost(host);
    if (!normalized) return null;
    return this.domains.get(normalized) ?? null;
  }
}
