/**
 * Tenant Resolver Middleware unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantResolverMiddleware } from '../tenant-resolver.middleware.js';

const mockPool: any = {
  query: vi.fn(),
};
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

function makeReq(host: string, path = '/'): any {
  return {
    headers: { host },
    path,
  };
}

function makeRes(): any {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
  return res;
}

describe('TenantResolverMiddleware', () => {
  let resolver: TenantResolverMiddleware;
  let next: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockReset();
    process.env['ETICART_BASE_DOMAIN'] = 'eticart.com.tr';
    resolver = new TenantResolverMiddleware(mockPool, mockLogger);
    next = vi.fn();
  });

  describe('Subdomain çözümleme', () => {
    it('tenant subdomain → tenant_id set eder', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'tenant-uuid-1', slug: 'demo' }],
      });
      const req = makeReq('demo.eticart.com.tr');
      const res = makeRes();

      await resolver.middleware(req, res, next);

      expect(req.tenantContext).toBeDefined();
      expect(req.tenantContext.tenantId).toBe('tenant-uuid-1');
      expect(req.tenantContext.slug).toBe('demo');
      expect(req.tenantContext.source).toBe('subdomain');
      expect(res.setHeader).toHaveBeenCalledWith(
        'x-tenant-resolved',
        'tenant-uuid-1',
      );
      expect(next).toHaveBeenCalled();
    });

    it('olmayan subdomain → 404', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const req = makeReq('yok.eticart.com.tr');
      const res = makeRes();

      await resolver.middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Reserved subdomain bypass', () => {
    it.each(['www', 'api', 'admin', 'app', 'super', 'static'])(
      '%s.eticart.com.tr → tenant yok, geçer',
      async (sub) => {
        const req = makeReq(`${sub}.eticart.com.tr`);
        const res = makeRes();

        await resolver.middleware(req, res, next);

        expect(req.tenantContext).toBeUndefined();
        expect(next).toHaveBeenCalled();
        expect(mockPool.query).not.toHaveBeenCalled();
      },
    );
  });

  describe('Public path bypass', () => {
    it.each(['/api/v1/plans', '/api/v1/onboarding/signup', '/api/v1/health'])(
      '%s → tenant yok, geçer',
      async (path) => {
        const req = makeReq('demo.eticart.com.tr', path);
        const res = makeRes();

        await resolver.middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      },
    );
  });

  describe('Custom domain çözümleme', () => {
    it('custom domain → tenant_id set eder', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ tenant_id: 'tenant-uuid-2', slug: 'demo' }],
      });
      const req = makeReq('magaza.example.com');
      const res = makeRes();

      await resolver.middleware(req, res, next);

      expect(req.tenantContext).toBeDefined();
      expect(req.tenantContext.tenantId).toBe('tenant-uuid-2');
      expect(req.tenantContext.source).toBe('custom_domain');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Cache', () => {
    it('aynı host ikinci çağrıda DB sorgusu yapmaz', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'tenant-1', slug: 'demo' }],
      });

      const req1 = makeReq('demo.eticart.com.tr');
      await resolver.middleware(req1, makeRes(), next);
      const callsAfterFirst = mockPool.query.mock.calls.length;

      const req2 = makeReq('demo.eticart.com.tr');
      await resolver.middleware(req2, makeRes(), next);
      const callsAfterSecond = mockPool.query.mock.calls.length;

      expect(callsAfterSecond).toBe(callsAfterFirst);
    });

    it('invalidate() cache temizler', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'tenant-1', slug: 'demo' }],
      });

      const req1 = makeReq('demo.eticart.com.tr');
      await resolver.middleware(req1, makeRes(), next);
      const callsFirst = mockPool.query.mock.calls.length;

      resolver.invalidate('demo.eticart.com.tr');

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'tenant-1', slug: 'demo' }],
      });
      const req2 = makeReq('demo.eticart.com.tr');
      await resolver.middleware(req2, makeRes(), next);
      const callsSecond = mockPool.query.mock.calls.length;

      expect(callsSecond).toBe(callsFirst + 1);
    });
  });

  describe('X-Forwarded-Host', () => {
    it('proxy arkasında doğru host çıkarılır', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'tenant-1', slug: 'demo' }],
      });
      const req = makeReq('proxy.internal:443');
      req.headers['x-forwarded-host'] = 'demo.eticart.com.tr';
      const res = makeRes();

      await resolver.middleware(req, res, next);

      expect(req.tenantContext).toBeDefined();
      expect(req.tenantContext.host).toBe('demo.eticart.com.tr');
    });
  });
});
