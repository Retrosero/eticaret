/**
 * Analytics Service — unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsService } from '../analytics.service.js';

const mockPool: any = {
  query: vi.fn(),
};
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockReset();
    service = new AnalyticsService(mockLogger, mockPool);
  });

  describe('getTenantAnalytics()', () => {
    it('toplam + MRR + at-risk + plan distribution', async () => {
      // mockImplementation default cevap
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes("status = 'cancelled'")) {
          return { rows: [{ churned: '5', wasActive: '80' }] };
        }
        if (sql.includes('FROM public.tenants') && sql.includes('COUNT')) {
          return { rows: [{ total: '100', active: '75', trial: '20', suspended: '5' }] };
        }
        if (sql.includes('SUM(p.monthly_price_kurus)')) {
          return { rows: [{ mrr: '500000' }] };
        }
        if (sql.includes('COUNT(DISTINCT tenant_id)')) {
          return { rows: [{ count: '50' }] };
        }
        if (sql.includes('SELECT tenant_id, name FROM public.tenants')) {
          return { rows: [] }; // atRisk listesi boş
        }
        if (sql.includes('GROUP BY s.plan_code') && sql.includes('COUNT(*) AS count')) {
          return {
            rows: [
              { plan_code: 'starter', count: '40', mrr: '100000' },
              { plan_code: 'growth', count: '10', mrr: '400000' },
            ],
          };
        }
        // cohort + diğer
        return { rows: [] };
      });

      const result = await service.getTenantAnalytics();
      expect(result.totalTenants).toBe(100);
      expect(result.activeTenants).toBe(75);
      expect(result.mrrTry).toBe(5000);
      expect(result.arrTry).toBe(60000);
      expect(result.arpuTry).toBe(100);
      expect(result.churnRate30d).toBeCloseTo(5 / 80);
      expect(result.planDistribution.length).toBeGreaterThanOrEqual(1);
      expect(result.atRiskTenants).toEqual([]);
    });

    it('churnRate 0 (no churn)', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM public.tenants') && sql.includes('COUNT')) {
          return { rows: [{ total: '10', active: '10', trial: '0', suspended: '0' }] };
        }
        if (sql.includes('churned')) {
          return { rows: [{ churned: '0', was_active: '10' }] };
        }
        if (sql.includes('SUM(p.monthly_price_kurus)')) {
          return { rows: [{ mrr: '0' }] };
        }
        if (sql.includes('COUNT(DISTINCT tenant_id)')) {
          return { rows: [{ count: '0' }] };
        }
        return { rows: [] };
      });
      const r = await service.getTenantAnalytics();
      expect(r.churnRate30d).toBe(0);
    });
  });

  describe('getEngagementScore()', () => {
    it('yüksek sipariş + aktif kullanıcı → yüksek score', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ avg: '500' }] })
        .mockResolvedValueOnce({ rows: [{ last_login: new Date() }] });

      const r = await service.getEngagementScore('tenant-1');
      expect(r.score).toBeGreaterThan(70);
      expect(r.metrics.ordersLast30d).toBe(10);
      expect(r.metrics.activeUsers).toBe(3);
    });

    it('düşük aktivite → düşük score', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ avg: '0' }] })
        .mockResolvedValueOnce({ rows: [{ last_login: null }] });
      const r = await service.getEngagementScore('tenant-1');
      expect(r.score).toBeLessThan(20);
      expect(r.metrics.lastLoginDays).toBe(999);
    });

    it('score max 100', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1000' }] })
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [{ avg: '99999' }] })
        .mockResolvedValueOnce({ rows: [{ last_login: new Date() }] });
      const r = await service.getEngagementScore('t-1');
      expect(r.score).toBe(100);
    });
  });
});