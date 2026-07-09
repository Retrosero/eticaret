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

  describe('getSalesOverview()', () => {
    it('tüm metrikleri döner', async () => {
      // overview query
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            total_revenue: '1000000',
            total_orders: '50',
            unique_customers: '30',
            refunds: '5000',
          },
        ],
      });
      // newVsReturning
      mockPool.query.mockResolvedValueOnce({
        rows: [{ new: '10', returning: '20' }],
      });
      // dailySeries
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { date: '2026-07-01', revenue: '50000', orders: '3' },
          { date: '2026-07-02', revenue: '75000', orders: '4' },
        ],
      });

      const result = await service.getSalesOverview('t-1', '30d');
      expect(result.totalRevenue).toBe(1000000);
      expect(result.totalOrders).toBe(50);
      expect(result.averageOrderValue).toBe(20000); // 1000000/50
      expect(result.uniqueCustomers).toBe(30);
      expect(result.refunds).toBe(5000);
      expect(result.newVsReturning).toEqual({ new: 10, returning: 20 });
      expect(result.dailySeries).toHaveLength(2);
    });

    it('sıfır sipariş → AOV=0', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            total_revenue: '0',
            total_orders: '0',
            unique_customers: '0',
            refunds: '0',
          },
        ],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ new: '0', returning: '0' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getSalesOverview('t-1', '30d');
      expect(result.averageOrderValue).toBe(0);
    });
  });

  describe('getTopProducts()', () => {
    it('en çok satan ürünler', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            product_id: 'p-1',
            product_name: 'Ürün 1',
            sku: 'SKU-1',
            image_url: 'https://cdn/img.jpg',
            units_sold: '100',
            revenue: '500000',
            order_count: '30',
          },
        ],
      });

      const result = await service.getTopProducts('t-1', '30d', 10);
      expect(result).toHaveLength(1);
      expect(result[0]?.productName).toBe('Ürün 1');
      expect(result[0]?.revenue).toBe(500000);
      expect(result[0]?.unitsSold).toBe(100);
    });

    it('limit uygulanır', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await service.getTopProducts('t-1', '7d', 5);
      // limit $2, interval $3
      const params = mockPool.query.mock.calls[0][1];
      expect(params).toContain(5);
    });
  });

  describe('getTopCategories()', () => {
    it('kategori bazlı', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            category_id: 'c-1',
            category_name: 'Elektronik',
            units_sold: '500',
            revenue: '2500000',
            product_count: '20',
          },
        ],
      });

      const result = await service.getTopCategories('t-1', '30d', 10);
      expect(result[0]?.categoryName).toBe('Elektronik');
      expect(result[0]?.revenue).toBe(2500000);
    });
  });

  describe('getCustomerCohort()', () => {
    it('cohort retention matrix', async () => {
      // cohorts query
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { cohort: '2026-01', customer_id: 'c-1' },
          { cohort: '2026-01', customer_id: 'c-2' },
          { cohort: '2026-02', customer_id: 'c-3' },
        ],
      });
      // activity query
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { cohort: '2026-01', active_month: '2026-01' },
          { cohort: '2026-01', active_month: '2026-02' },
          { cohort: '2026-02', active_month: '2026-02' },
        ],
      });

      const result = await service.getCustomerCohort('t-1', 6);
      expect(result.cohorts.length).toBeGreaterThan(0);
      const jan = result.cohorts.find((c) => c.cohort === '2026-01');
      expect(jan?.size).toBe(2);
      expect(jan?.retention[0]).toBe(1); // 100% 0. ay
      expect(jan?.retention[1]).toBe(1); // 100% 1. ay (c-1 ve c-2 2026-02'de yok, sadece c-1 var)
    });
  });

  describe('getConversionFunnel()', () => {
    it('tüm aşamalar', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1000' }] }); // visitors
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '300' }] }); // addToCart
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '100' }] }); // checkout
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '50' }] }); // orders

      const result = await service.getConversionFunnel('t-1', '30d');
      expect(result.stages).toHaveLength(4);
      expect(result.stages[0]?.name).toBe('Ziyaretçi');
      expect(result.stages[0]?.count).toBe(1000);
      expect(result.stages[3]?.name).toBe('Sipariş');
      expect(result.stages[3]?.count).toBe(50);
      // Conversion: visitors → addToCart = 30%
      expect(result.stages[1]?.conversionRate).toBe(30);
      // addToCart → checkout = 33.33%
      expect(result.stages[2]?.conversionRate).toBe(33.33);
      // checkout → order = 50%
      expect(result.stages[3]?.conversionRate).toBe(50);
    });

    it('sıfır visitors → tüm oranlar 0', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ count: '0' }] });

      const result = await service.getConversionFunnel('t-1', '30d');
      expect(result.stages[0]?.conversionRate).toBe(0);
      expect(result.stages.every((s) => s.count === 0)).toBe(true);
    });
  });

  describe('getRevenueByChannel()', () => {
    it('kanal bazlı gelir', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { channel: 'direct', order_count: '100', revenue: '500000' },
          { channel: 'marketplace', order_count: '50', revenue: '300000' },
        ],
      });

      const result = await service.getRevenueByChannel('t-1', '30d');
      expect(result).toHaveLength(2);
      expect(result[0]?.channel).toBe('direct');
      expect(result[0]?.revenue).toBe(500000);
    });
  });

  describe('getRealtimeStats()', () => {
    it('4 paralel query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '25' }] }); // active
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '10', revenue: '50000' }] }); // today
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }] }); // pending
      mockPool.query.mockResolvedValueOnce({ rows: [{ created_at: new Date() }] }); // last

      const result = await service.getRealtimeStats('t-1');
      expect(result.activeVisitors).toBe(25);
      expect(result.todayOrders).toBe(10);
      expect(result.todayRevenue).toBe(50000);
      expect(result.pendingOrders).toBe(5);
      expect(result.lastOrderAt).toBeDefined();
    });

    it('sipariş yok → lastOrderAt null', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0', revenue: '0' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getRealtimeStats('t-1');
      expect(result.lastOrderAt).toBeNull();
    });
  });

  describe('exportOrdersCsv()', () => {
    it('CSV formatında döner', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            order_number: 'T1-20260706-001',
            customer_email: 'a@b.com',
            customer_name: 'Ali Veli',
            total_amount: '10000',
            status: 'completed',
            created_at: new Date('2026-07-06T10:00:00Z'),
          },
        ],
      });

      const csv = await service.exportOrdersCsv('t-1', '30d');
      expect(csv).toContain('Sipariş No,Müşteri Email');
      expect(csv).toContain('T1-20260706-001');
      expect(csv).toContain('a@b.com');
    });
  });

  describe('Range parsing', () => {
    it('rangeToInterval internal', () => {
      const fn = (service as any).rangeToInterval.bind(service);
      expect(fn('24h')).toBe('24 hours');
      expect(fn('7d')).toBe('7 days');
      expect(fn('30d')).toBe('30 days');
      expect(fn('90d')).toBe('90 days');
      expect(fn('1y')).toBe('365 days');
      expect(fn('all')).toBe('100 years');
      expect(fn('invalid')).toBe('30 days');
    });
  });
});
