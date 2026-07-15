import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import {
  TenantResolverMiddleware,
  type RequestWithTenant,
} from '../tenant-resolver.middleware.js';

const TENANT_A = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', slug: 'firma-a' };
const TENANT_B = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', slug: 'firma-b' };

function setup() {
  const queryRaw = vi.fn(async (sql: string, value: string) => {
    if (sql.includes('tenant_domains')) {
      return value === 'magaza-firma-a.test' ? [TENANT_A] : [];
    }
    if (sql.includes('lower(slug)') && value === 'firma-a') return [TENANT_A];
    if (sql.includes('lower(slug)') && value === 'firma-b') return [TENANT_B];
    return [];
  });
  const middleware = new TenantResolverMiddleware({ client: { $queryRawUnsafe: queryRaw } } as never);
  const next = vi.fn<NextFunction>();
  const res = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return { middleware, next, res, queryRaw };
}

function request(host: string, path = '/api/store/products'): RequestWithTenant {
  return {
    path,
    headers: { host, 'x-tenant-id': TENANT_B.id },
  } as unknown as RequestWithTenant;
}

describe('TenantResolverMiddleware', () => {
  it('subdomain üzerinden tenant çözer ve client tenant headerını yok sayar', async () => {
    const { middleware, next, res } = setup();
    const req = request('firma-a.eticart.com.tr');

    await middleware.use(req, res, next);

    expect(req.tenantContext).toMatchObject({
      tenantId: TENANT_A.id,
      tenantSlug: TENANT_A.slug,
      source: 'subdomain',
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.setHeader).toHaveBeenCalledWith('x-tenant-resolved', TENANT_A.id);
  });

  it('verified custom domain üzerinden tenant çözer', async () => {
    const { middleware, next, res } = setup();
    const req = request('magaza-firma-a.test');

    await middleware.use(req, res, next);

    expect(req.tenantContext?.tenantId).toBe(TENANT_A.id);
    expect(req.tenantContext?.source).toBe('custom-domain');
  });

  it('bilinmeyen hostu downstream controllera bırakmaz', async () => {
    const { middleware, next, res } = setup();

    await middleware.use(request('bilinmeyen.test'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TENANT_NOT_FOUND' }));
  });

  it('health endpointini tenant çözümlemeden geçirir', async () => {
    const { middleware, next, queryRaw } = setup();

    await middleware.use(request('bilinmeyen.test', '/health'), {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
