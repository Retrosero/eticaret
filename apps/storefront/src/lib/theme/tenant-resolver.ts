import { queryControlRows } from '../server/control-db';
import type { StorefrontTenantContext } from './types';

interface TenantRow extends Record<string, unknown> {
  id: string;
  slug: string;
  primary_domain: string | null;
  locale: string;
  currency: 'TRY' | 'EUR' | 'USD';
}

const DEV_HOSTS = new Set([
  'localhost',
  'localhost:3000',
  '127.0.0.1',
  '127.0.0.1:3000',
]);

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function baseDomain(): string {
  return (process.env['ETICART_BASE_DOMAIN'] ?? 'eticart.com.tr').toLowerCase();
}

function extractSubdomain(host: string): string | null {
  const domain = baseDomain();
  if (!host.endsWith(`.${domain}`)) return null;
  const prefix = host.slice(0, host.length - domain.length - 1);
  if (!prefix) return null;
  return prefix.split('.').pop() ?? null;
}

function toTenantContext(row: TenantRow): StorefrontTenantContext {
  return {
    tenantId: row.id,
    tenantSlug: row.slug,
    primaryDomain: row.primary_domain ?? `${row.slug}.${baseDomain()}`,
    currency: row.currency,
    locale: row.locale,
  };
}

async function resolveDevelopmentTenant(): Promise<StorefrontTenantContext | null> {
  const preferredSlug = process.env['STOREFRONT_DEFAULT_TENANT_SLUG']?.trim().toLowerCase() ?? null;

  if (preferredSlug) {
    const preferred = await queryControlRows<TenantRow>(
      `SELECT id, slug, primary_domain, locale, currency
       FROM public.tenants
       WHERE slug = $1
         AND status IN ('active', 'trial', 'provisioning')
       LIMIT 1`,
      [preferredSlug],
    );
    if (preferred[0]) {
      return toTenantContext(preferred[0]);
    }
  }

  const rows = await queryControlRows<TenantRow>(
    `SELECT id, slug, primary_domain, locale, currency
     FROM public.tenants
     WHERE status IN ('active', 'trial', 'provisioning')
     ORDER BY created_at ASC
     LIMIT 1`,
  );
  return rows[0] ? toTenantContext(rows[0]) : null;
}

export async function resolveStorefrontTenant(host: string): Promise<StorefrontTenantContext | null> {
  const normalized = normalizeHost(host);

  try {
    if (DEV_HOSTS.has(normalized)) {
      return await resolveDevelopmentTenant();
    }

    const subdomain = extractSubdomain(normalized);
    if (subdomain) {
      const rows = await queryControlRows<TenantRow>(
        `SELECT id, slug, primary_domain, locale, currency
         FROM public.tenants
         WHERE slug = $1
           AND status IN ('active', 'trial', 'provisioning')
         LIMIT 1`,
        [subdomain],
      );
      return rows[0] ? toTenantContext(rows[0]) : null;
    }

    const rows = await queryControlRows<TenantRow>(
      `SELECT t.id, t.slug, t.primary_domain, t.locale, t.currency
       FROM public.tenant_domains d
       INNER JOIN public.tenants t ON t.id = d.tenant_id
       WHERE lower(d.domain) = $1
         AND d.verification_status = 'verified'
         AND t.status IN ('active', 'trial')
       LIMIT 1`,
      [normalized],
    );
    return rows[0] ? toTenantContext(rows[0]) : null;
  } catch {
    return null;
  }
}
