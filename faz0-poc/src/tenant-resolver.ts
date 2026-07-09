/**
 * tenant-resolver.ts — Domain'den tenant çözümleme.
 *
 * ADR-001'deki karar: Tenant bilgisi ASLA istemciden güvenli olmayan bir
 * kaynaktan (x-tenant-id header gibi) alınmaz. Her zaman sunucu tarafı
 * domain tablosundan çözümlenir.
 *
 * Bu modül bir HTTP katmanı DEĞİLDİR; doğrudan `host` parametresini alır.
 * Next.js, Express, NestJS middleware'leri bu fonksiyonu çağırır.
 */

import './env.js';
import { getControlPool } from './db.js';

export interface TenantResolution {
  tenantId: string;
  slug: string;
  schemaName: string;
  status: 'active' | 'suspended' | 'deleted';
  plan: 'starter' | 'pro' | 'enterprise';
}

/**
 * Domain'den tenant çözer.
 *
 * @param host gelen Host header değeri (örn. "firma-a.local:3000" veya "firma-a.local")
 * @returns TenantResolution veya null (tenant bulunamazsa)
 */
export async function resolveTenantByDomain(host: string | null | undefined): Promise<TenantResolution | null> {
  if (!host) return null;
  const cleanHost = stripPort(host).toLowerCase();

  // KVKK notu: domain tek başına kişisel veri değildir; loglanabilir.
  const pool = getControlPool();
  try {
    const { rows } = await pool.query<{
      tenant_id: string;
      slug: string;
      schema_name: string;
      status: TenantResolution['status'];
      plan: TenantResolution['plan'];
    }>(
      `SELECT t.tenant_id, t.slug, t.schema_name, t.status, t.plan
       FROM tenants t
       INNER JOIN tenant_domains d ON d.tenant_id = t.tenant_id
       WHERE d.domain = $1
         AND t.status <> 'deleted'
       LIMIT 1`,
      [cleanHost],
    );

    const row = rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      slug: row.slug,
      schemaName: row.schema_name,
      status: row.status,
      plan: row.plan,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Slug'tan tenant çözer. Provision scripti ve admin uçları için.
 */
export async function resolveTenantBySlug(slug: string): Promise<TenantResolution | null> {
  if (!/^[a-z0-9_-]+$/.test(slug)) {
    throw new Error('Geçersiz slug');
  }
  const pool = getControlPool();
  try {
    const { rows } = await pool.query<{
      tenant_id: string;
      slug: string;
      schema_name: string;
      status: TenantResolution['status'];
      plan: TenantResolution['plan'];
    }>(
      `SELECT tenant_id, slug, schema_name, status, plan
       FROM tenants
       WHERE slug = $1
       LIMIT 1`,
      [slug.toLowerCase()],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      slug: row.slug,
      schemaName: row.schema_name,
      status: row.status,
      plan: row.plan,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Host başındaki port kısmını ayırır ("example.com:3000" -> "example.com").
 * Header manipülasyonuna karşı basit savunma; geliştirme için yeterli.
 */
function stripPort(host: string): string {
  const colonIndex = host.indexOf(':');
  return colonIndex === -1 ? host : host.substring(0, colonIndex);
}

/**
 * Domain'in tenant'a ait olduğunu DOĞRULAR (resolve + ownership).
 * Bir ID tahmin saldırısında, saldırgan bilinen bir UUID'yi URL'e yazabilir;
 * bu fonksiyon, ID'nin o domaine ait olduğunu kontrol eder.
 *
 * @param host gelen Host header değeri
 * @param claimedTenantId URL veya header'dan gelen tenant_id
 */
export async function verifyTenantOwnership(
  host: string | null | undefined,
  claimedTenantId: string,
): Promise<boolean> {
  const resolved = await resolveTenantByDomain(host);
  if (!resolved) return false;
  return resolved.tenantId === claimedTenantId;
}
