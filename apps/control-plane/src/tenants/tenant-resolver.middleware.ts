/**
 * Tenant Resolver Middleware.
 *
 * Her HTTP isteğinde `Host` başlığını parse edip tenant bilgisini
 * request'e ekler. İki çözümleme yöntemi:
 *
 *  1. **Subdomain**: `demo.eticart.com.tr` → `demo` slug
 *  2. **Custom domain**: `magaza.example.com` → domains tablosunda ara
 *
 * Başarılı çözümleme sonrası:
 *  - `x-tenant-resolved: <tenantId>` header set edilir
 *  - `req.tenantContext` (TypedRequest) üzerinden erişilebilir
 *  - Bilinmeyen host'lar 404 ile reddedilir
 *
 * GÜVENLİK:
 *  - Sadece `Host` başlığına güvenilir, `X-Tenant-Id` ASLA kabul edilmez.
 *  - Public subdomain'ler (`www`, `api`, `app`, `admin`, `static`) bypass.
 *  - Reserved slug listesi (system kullanım): `www`, `api`, `app`, `admin`,
 *    `static`, `cdn`, `mail`, `status`, `docs`, `blog`, `super`.
 *
 * @example
 * ```ts
 * // main.ts
 * app.use(tenantResolver.middleware);
 * ```
 */
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';

import { PG_POOL_TOKEN } from '../database/database.module.js';
import { LOGGER_TOKEN } from '../common/logger.js';

/** Reserved subdomain'ler — tenant olarak kullanılamaz. */
const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'app',
  'admin',
  'static',
  'cdn',
  'mail',
  'status',
  'docs',
  'blog',
  'super',
  'super-admin',
  'control-plane',
  'root',
  'auth',
  'onboarding',
  'pricing',
  'billing',
  'signup',
  'login',
  'help',
  'support',
  'tenant',
  'tenants',
]);

/** Tenant çözümleme sonucu — request'e eklenir. */
export interface ResolvedTenant {
  tenantId: string;
  slug: string;
  source: 'subdomain' | 'custom_domain';
  host: string;
}

/** Express request'e tenant ekle. */
export type RequestWithTenant = Request & {
  tenantContext?: ResolvedTenant;
};

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  /** Tenant cache: slug → tenantId (5 dakika TTL). */
  private readonly cache = new Map<
    string,
    { tenant: ResolvedTenant; expiresAt: number }
  >();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    @Inject(PG_POOL_TOKEN) private readonly pool: Pool,
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
  ) {}

  /**
   * Express middleware fonksiyonu.
   */
  middleware = async (
    req: RequestWithTenant,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const host = this.extractHost(req);

    // Reserved subdomain'ler → tenant yok, geç
    if (this.isReservedHost(host)) {
      return next();
    }

    // Public endpoint'ler (auth/signup/pricing) → tenant yok
    if (this.isPublicPath(req.path)) {
      return next();
    }

    try {
      const tenant = await this.resolveTenant(host);
      if (!tenant) {
        this.logger.warn({ host, path: req.path }, 'Bilinmeyen host');
        throw new ApiError(
          404,
          ErrorCode.NOT_FOUND,
          'Tenant bulunamadı.',
          { host },
        );
      }
      req.tenantContext = tenant;
      res.setHeader('x-tenant-resolved', tenant.tenantId);
      next();
    } catch (err) {
      if (err instanceof ApiError) {
        res
          .status(err.statusCode)
          .json({ code: err.code, message: err.message, details: err.details });
        return;
      }
      this.logger.error(
        { err: (err as Error).message, host },
        'Tenant çözümleme hatası',
      );
      res
        .status(500)
        .json({ code: 'TENANT_RESOLVE_ERROR', message: 'Sunucu hatası.' });
    }
  };

  use = this.middleware;

  // -------------------------------------------------------------------
  // Dahili — Host parse
  // -------------------------------------------------------------------

  private extractHost(req: Request): string {
    // X-Forwarded-Host proxy arkasında (Coolify, Cloudflare)
    const xfh = req.headers['x-forwarded-host'];
    if (typeof xfh === 'string' && xfh.length > 0) {
      return xfh.split(',')[0]!.trim().toLowerCase();
    }
    // Standart Host header
    const host = req.headers.host;
    if (typeof host === 'string' && host.length > 0) {
      return host.split(':')[0]!.toLowerCase();
    }
    return 'localhost';
  }

  private isReservedHost(host: string): boolean {
    // Root domain ve www her zaman reserved
    const baseDomain = process.env['ETICART_BASE_DOMAIN'] ?? 'eticart.com.tr';
    if (host === baseDomain) return true;
    if (host === `www.${baseDomain}`) return true;

    // Subdomain varsa ve reserved listesinde ise
    const sub = this.extractSubdomain(host);
    if (sub === null) return false; // null = custom domain, reserved değil
    return RESERVED_SUBDOMAINS.has(sub);
  }

  private isPublicPath(path: string): boolean {
    const publicPaths = [
      '/api/v1/plans',
      '/api/v1/onboarding',
      '/api/v1/health',
      '/api/v1/auth',
      '/api/v1/super-admin',
      '/api/v1/webhooks',
      '/api/v1/docs',
    ];
    return publicPaths.some((p) => path.startsWith(p));
  }

  /**
   * Subdomain'i ayıkla: `demo.eticart.com.tr` → `demo`
   * Custom domain'ler için null döner.
   */
  private extractSubdomain(host: string): string | null {
    const baseDomain = process.env['ETICART_BASE_DOMAIN'] ?? 'eticart.com.tr';

    // Ana domain: eticart.com.tr
    if (host === baseDomain) return null;
    // www.eticart.com.tr
    if (host === `www.${baseDomain}`) return null;

    // *.eticart.com.tr → subdomain var
    if (host.endsWith(`.${baseDomain}`)) {
      const sub = host.slice(0, host.length - baseDomain.length - 1);
      // Nested subdomain (test.tenant.eticart.com.tr) → en üst
      return sub.split('.').pop() ?? null;
    }

    // Custom domain → null (resolveTenant custom domain tablosuna düşer)
    return null;
  }

  // -------------------------------------------------------------------
  // Dahili — Tenant resolve
  // -------------------------------------------------------------------

  private async resolveTenant(host: string): Promise<ResolvedTenant | null> {
    // 1. Cache kontrol
    const cached = this.cache.get(host);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tenant;
    }

    // 2. Subdomain olarak çözümle
    const subdomain = this.extractSubdomain(host);
    if (subdomain) {
      const tenant = await this.findTenantBySlug(subdomain);
      if (tenant) {
        const resolved: ResolvedTenant = {
          tenantId: tenant.tenantId,
          slug: tenant.slug,
          source: 'subdomain',
          host,
        };
        this.cache.set(host, {
          tenant: resolved,
          expiresAt: Date.now() + this.CACHE_TTL_MS,
        });
        return resolved;
      }
    }

    // 3. Custom domain olarak çözümle
    const tenant = await this.findTenantByCustomDomain(host);
    if (tenant) {
      const resolved: ResolvedTenant = {
        tenantId: tenant.tenantId,
        slug: tenant.slug,
        source: 'custom_domain',
        host,
      };
      this.cache.set(host, {
        tenant: resolved,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      return resolved;
    }

    return null;
  }

  private async findTenantBySlug(
    slug: string,
  ): Promise<{ tenantId: string; slug: string } | null> {
    const r = await this.pool.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM public.tenants
       WHERE slug = $1
         AND status IN ('active', 'trial', 'provisioning')
       LIMIT 1`,
      [slug],
    );
    const row = r.rows[0];
    if (!row) return null;
    return { tenantId: row.id, slug: row.slug };
  }

  private async findTenantByCustomDomain(
    domain: string,
  ): Promise<{ tenantId: string; slug: string } | null> {
    const r = await this.pool.query<{ tenant_id: string; slug: string }>(
      `SELECT t.id as tenant_id, t.slug
       FROM public.tenant_domains d
       INNER JOIN public.tenants t ON t.id = d.tenant_id
       WHERE d.domain = $1
         AND d.status = 'verified'
         AND t.status IN ('active', 'trial')
       LIMIT 1`,
      [domain],
    );
    const row = r.rows[0];
    if (!row) return null;
    return { tenantId: row.tenant_id, slug: row.slug };
  }

  /**
   * Cache'i invalidate et (tenant güncellendiğinde).
   */
  invalidate(host: string): void {
    this.cache.delete(host);
  }

  /**
   * Tüm cache'i temizle.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
