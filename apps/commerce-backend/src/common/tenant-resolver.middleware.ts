import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ApiError, ErrorCode } from '@eticart/config';

import { ControlPrismaService, CONTROL_PRISMA_TOKEN } from '../db/prisma.service.js';

const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'app', 'admin', 'static', 'cdn', 'docs',
  'super-admin', 'control-plane',
]);

const PUBLIC_PATHS = [
  '/health', '/ready', '/api/health', '/api/ready', '/api/docs',
  '/api/auth/login', '/api/auth/register', '/api/auth/refresh',
];

export interface ResolvedCommerceTenant {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly host: string;
  readonly source: 'subdomain' | 'custom-domain' | 'development';
}

export type RequestWithTenant = Request & {
  tenantContext?: ResolvedCommerceTenant;
  tenantId?: string;
  tenantSlug?: string;
};

type TenantRow = { id: string; slug: string };

/** Host/custom-domain -> tenant çözümlemesi. Client tenant header'larına güvenmez. */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly cache = new Map<string, { tenant: ResolvedCommerceTenant; expiresAt: number }>();
  private readonly cacheTtlMs = 60_000;

  constructor(@Inject(CONTROL_PRISMA_TOKEN) private readonly prisma: ControlPrismaService) {}

  async use(req: RequestWithTenant, res: Response, next: NextFunction): Promise<void> {
    if (this.isPublicPath(req.originalUrl ?? req.path)) {
      next();
      return;
    }

    const host = this.extractHost(req);
    try {
      const tenant = await this.resolve(host);
      if (!tenant) {
        throw new ApiError(404, ErrorCode.TENANT_NOT_FOUND, 'Tenant bulunamadı.', { details: { host } });
      }
      req.tenantContext = tenant;
      req.tenantId = tenant.tenantId;
      req.tenantSlug = tenant.tenantSlug;
      res.setHeader('x-tenant-resolved', tenant.tenantId);
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ code: error.code, message: error.message, details: error.details });
        return;
      }
      res.status(500).json({ code: 'TENANT_RESOLVE_ERROR', message: 'Tenant çözümleme başarısız.' });
    }
  }

  private isPublicPath(path: string): boolean {
    const normalized = path.split('?')[0] ?? path;
    return PUBLIC_PATHS.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
  }

  private extractHost(req: Request): string {
    const forwarded = req.headers['x-forwarded-host'];
    const rawHost = process.env['TRUST_PROXY'] === 'true' && typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : req.headers.host;
    return (rawHost ?? '').trim().toLowerCase().replace(/:\d+$/, '');
  }

  private async resolve(host: string): Promise<ResolvedCommerceTenant | null> {
    if (!host) return null;
    const cached = this.cache.get(host);
    if (cached && cached.expiresAt > Date.now()) return cached.tenant;

    const baseDomain = (process.env['ETICART_BASE_DOMAIN'] ?? 'eticart.com.tr').toLowerCase();
    const subdomain = this.extractSubdomain(host, baseDomain);
    let row: TenantRow | null = null;
    let source: ResolvedCommerceTenant['source'] = 'custom-domain';

    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      row = await this.findBySlug(subdomain);
      source = 'subdomain';
    }
    if (!row) row = await this.findByCustomDomain(host);

    if (!row && process.env['NODE_ENV'] === 'development' && host === 'localhost') {
      const devSlug = process.env['DEV_DEFAULT_TENANT_SLUG'];
      if (devSlug) {
        row = await this.findBySlug(devSlug);
        source = 'development';
      }
    }
    if (!row) return null;

    const tenant: ResolvedCommerceTenant = { tenantId: row.id, tenantSlug: row.slug, host, source };
    this.cache.set(host, { tenant, expiresAt: Date.now() + this.cacheTtlMs });
    return tenant;
  }

  private extractSubdomain(host: string, baseDomain: string): string | null {
    if (!host.endsWith(`.${baseDomain}`)) return null;
    const prefix = host.slice(0, -(baseDomain.length + 1));
    if (!prefix || prefix.includes('.')) return null;
    return prefix;
  }

  private async findBySlug(slug: string): Promise<TenantRow | null> {
    const rows = await this.prisma.client.$queryRawUnsafe(
      `SELECT id, slug FROM public.tenants WHERE lower(slug) = lower($1)
       AND status IN ('active', 'trial') AND deleted_at IS NULL LIMIT 1`, slug,
    );
    return (rows as TenantRow[])[0] ?? null;
  }

  private async findByCustomDomain(host: string): Promise<TenantRow | null> {
    const rows = await this.prisma.client.$queryRawUnsafe(
      `SELECT t.id, t.slug FROM public.tenant_domains d
       INNER JOIN public.tenants t ON t.id = d.tenant_id
       WHERE lower(d.domain) = lower($1) AND d.verification_status = 'verified'
       AND t.status IN ('active', 'trial') AND t.deleted_at IS NULL LIMIT 1`, host,
    );
    return (rows as TenantRow[])[0] ?? null;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
