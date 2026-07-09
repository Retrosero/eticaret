/**
 * SuperAdminService — unit tests.
 *
 * Dashboard, metrics, tenant/plan/subscription yönetim
 * logic testleri.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@eticart/config';
import { SuperAdminService } from '../super-admin.service.js';

const mockPool: any = {
  query: vi.fn(),
};
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};
const mockTenantsService: any = {
  findById: vi.fn(),
  suspend: vi.fn(),
  reactivate: vi.fn(),
  archive: vi.fn(),
};
const mockPlans: any = {
  listActive: vi.fn(),
  upsert: vi.fn(),
};
const mockSubscriptions: any = {
  getActiveForTenant: vi.fn(),
  cancel: vi.fn(),
};
const mockAudit: any = {
  log: vi.fn(),
};

describe('SuperAdminService', () => {
  let service: SuperAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockReset();
    service = new SuperAdminService(
      mockLogger,
      mockPool,
      mockTenantsService,
      mockPlans,
      mockSubscriptions,
      mockAudit,
    );
  });

  describe('getDashboard()', () => {
    it('tüm KPI\'ları döner', async () => {
      // Tenant counts
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { status: 'active', count: '25' },
          { status: 'trial', count: '10' },
          { status: 'suspended', count: '2' },
        ],
      });
      // MRR
      mockPool.query.mockResolvedValueOnce({
        rows: [{ mrr_kurus: '1996000' }],
      });
      // Signups 24h
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      // Signups 7d
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '15' }] });
      // Churn
      mockPool.query.mockResolvedValueOnce({
        rows: [{ cancelled: '1', active: '25' }],
      });
      // Plan distribution
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { plan: 'starter', count: '20' },
          { plan: 'growth', count: '12' },
          { plan: 'business', count: '5' },
        ],
      });
      // Storage
      mockPool.query.mockResolvedValueOnce({ rows: [{ used: '5368709120' }] });
      // Recent activity
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getDashboard();

      expect(result.totalTenants).toBe(37);
      expect(result.activeTenants).toBe(25);
      expect(result.trialTenants).toBe(10);
      expect(result.suspendedTenants).toBe(2);
      expect(result.mrrKurus).toBe(1996000);
      expect(result.arrKurus).toBe(1996000 * 12);
      expect(result.signupsLast24h).toBe(5);
      expect(result.signupsLast7d).toBe(15);
      expect(result.churnRate30d).toBeGreaterThan(0);
      expect(result.storageUsedBytes).toBe(5368709120);
      expect(result.tenantsByPlan).toHaveLength(3);
    });

    it('hiç tenant yoksa boş dashboard döner', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ mrr_kurus: '0' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ cancelled: '0', active: '1' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ used: '0' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getDashboard();
      expect(result.totalTenants).toBe(0);
      expect(result.mrrKurus).toBe(0);
    });
  });

  describe('getMetrics()', () => {
    it('range string parse edilir', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getMetrics('7d');
      expect(result.range).toBe('7d');
    });

    it.each(['7d', '30d', '90d', '1y', 'invalid'])(
      '%s kabul edilir',
      async (range) => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
        mockPool.query.mockResolvedValueOnce({ rows: [] });
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const result = await service.getMetrics(range);
        expect(result.range).toBe(range);
      },
    );
  });

  describe('listTenants()', () => {
    it('filtresiz liste', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 't-1',
            slug: 'demo',
            name: 'Demo',
            status: 'active',
            plan: 'starter',
            owner_email: 'admin@demo.com',
            created_at: new Date('2026-01-01'),
            trial_ends_at: null,
          },
        ],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await service.listTenants({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].slug).toBe('demo');
      expect(result.items[0].ownerEmail).toBe('admin@demo.com');
      expect(result.total).toBe(1);
    });

    it('search filtresi', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.listTenants({ page: 1, limit: 20, search: 'demo' });

      // Search parametresi ilk sorguya geçti mi?
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('ILIKE');
      expect(firstCall[1]).toContain('%demo%');
    });

    it('status ve plan filtresi', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.listTenants({
        page: 1,
        limit: 20,
        status: 'trial',
        plan: 'starter',
      });

      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('status = $1');
      expect(firstCall[0]).toContain('plan = $2');
    });
  });

  describe('suspendTenant()', () => {
    it('mevcut tenant askıya alınır + audit log', async () => {
      mockTenantsService.findById.mockResolvedValue({
        id: 't-1',
        slug: 'demo',
        status: 'active',
      });

      const result = await service.suspendTenant('t-1', 'Ödeme gecikmesi');

      expect(result.ok).toBe(true);
      expect(mockTenantsService.suspend).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({ reason: 'Ödeme gecikmesi' }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'super_admin.tenant.suspend',
          resourceId: 't-1',
          actorType: 'super_admin',
        }),
      );
    });

    it('olmayan tenant → 404', async () => {
      mockTenantsService.findById.mockResolvedValue(null);

      await expect(service.suspendTenant('t-x', 'test')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('createPlan()', () => {
    it('yeni plan oluşturur + audit', async () => {
      mockPlans.upsert.mockResolvedValue({
        plan: { id: 'plan-1', code: 'custom' },
        features: [],
      });

      await service.createPlan({
        code: 'custom',
        name: 'Custom',
        description: 'Custom plan',
        monthlyPriceKurus: 99900,
        yearlyPriceKurus: 999000,
        currency: 'TRY',
        trialDays: 7,
        maxUsers: 5,
        maxProducts: 1000,
        maxOrdersPerMonth: 2000,
        maxStorageBytes: 5 * 1024 ** 3,
        sortOrder: 50,
        isActive: true,
        features: [],
      });

      expect(mockPlans.upsert).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'super_admin.plan.create',
          actorType: 'super_admin',
        }),
      );
    });
  });

  describe('queryAuditLog()', () => {
    it('filtresiz sorgu', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.queryAuditLog({ page: 1, limit: 50 });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
    });

    it('tenant filtresi', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.queryAuditLog({
        page: 1,
        limit: 50,
        tenantId: 't-1',
      });

      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('tenant_id = $1');
    });
  });

  describe('parseRangeToDays()', () => {
    it.each([
      ['7d', 7],
      ['30d', 30],
      ['90d', 90],
      ['1y', 365],
      ['invalid', 30],
    ])('%s → %d days', (input, expected) => {
      const fn = (service as any).parseRangeToDays.bind(service);
      expect(fn(input)).toBe(expected);
    });
  });
});
