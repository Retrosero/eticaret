/**
 * Mobile Service — unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@eticart/config';
import { MobileService } from '../mobile.service.js';

const mockPool: any = {
  query: vi.fn(),
};
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('MobileService', () => {
  let service: MobileService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockReset();
    service = new MobileService(mockLogger, mockPool);
  });

  describe('getDashboard()', () => {
    it('dashboard summary döner', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ revenue: '1000', orders: '5', customers: '4' }] }) // today
        .mockResolvedValueOnce({ rows: [{ revenue: '800', orders: '4' }] }) // yesterday
        .mockResolvedValueOnce({ rows: [{ revenue: '25000', orders: '120' }] }) // mtd
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // pending
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // low stock
        .mockResolvedValueOnce({ rows: [] }); // recent

      const result = await service.getDashboard('tenant-1');
      expect(result.today.revenue).toBe(1000);
      expect(result.today.orders).toBe(5);
      expect(result.today.customers).toBe(4);
      expect(result.yesterday.revenue).toBe(800);
      expect(result.monthToDate.revenue).toBe(25000);
      expect(result.pendingOrders).toBe(3);
      expect(result.lowStockProducts).toBe(2);
      expect(result.recentOrders).toEqual([]);
    });

    it('5 paralel query yapar', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] });
      await service.getDashboard('tenant-1');
      expect(mockPool.query).toHaveBeenCalledTimes(6);
    });
  });

  describe('listOrders()', () => {
    it('status filtresi olmadan tüm siparişler', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'o-1' }] });
      const result = await service.listOrders('tenant-1');
      expect(result).toHaveLength(1);
      const callArgs = mockPool.query.mock.calls[0]!;
      const sql = callArgs[0];
      const params = callArgs[1];
      expect(sql).not.toContain('AND status');
      expect(params).toEqual(['tenant-1', 50]);
    });

    it('status filtresi ile', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await service.listOrders('tenant-1', 'pending');
      const callArgs = mockPool.query.mock.calls[0]!;
      const sql = callArgs[0];
      const params = callArgs[1];
      expect(sql).toContain('AND status');
      expect(params).toEqual(['tenant-1', 'pending', 50]);
    });

    it('limit değeri', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await service.listOrders('tenant-1', undefined, 10);
      const callArgs = mockPool.query.mock.calls[0]!;
      expect(callArgs[1]).toEqual(['tenant-1', 10]);
    });
  });

  describe('getOrderDetail()', () => {
    it('mevcut sipariş → detay döner', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'o-1', items: [] }],
      });
      const result = await service.getOrderDetail('tenant-1', 'o-1');
      expect(result).toEqual({ id: 'o-1', items: [] });
    });

    it('olmayan sipariş → 404', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getOrderDetail('tenant-1', 'o-x')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('updateOrderStatus()', () => {
    it('başarılı güncelleme', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      const result = await service.updateOrderStatus('tenant-1', 'o-1', 'shipped', 'Kargoya verildi');
      expect(result.ok).toBe(true);
    });

    it('olmayan sipariş → 404', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(
        service.updateOrderStatus('tenant-1', 'o-x', 'shipped'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listProducts()', () => {
    it('lowStock filtresi ile', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'p-1', status: 'low_stock' }] });
      const result = await service.listProducts('tenant-1', { lowStock: true });
      expect(result).toHaveLength(1);
      const [sql] = mockPool.query.mock.calls[0]!;
      expect(sql).toContain('AND stock <= low_stock_threshold');
    });

    it('filtresiz tüm ürünler', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.listProducts('tenant-1');
      expect(result).toEqual([]);
      const [sql] = mockPool.query.mock.calls[0]!;
      expect(sql).not.toContain('AND stock <= low_stock_threshold');
    });
  });

  describe('updateStock()', () => {
    it('başarılı stok güncelleme', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      const result = await service.updateStock('tenant-1', 'p-1', 50);
      expect(result.ok).toBe(true);
    });

    it('negatif stok → 422', async () => {
      await expect(service.updateStock('tenant-1', 'p-1', -1)).rejects.toMatchObject({
        statusCode: 422,
      });
    });

    it('olmayan ürün → 404', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.updateStock('tenant-1', 'p-x', 5)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('registerPushToken()', () => {
    it('push token kaydeder', async () => {
      mockPool.query.mockResolvedValueOnce({});
      const result = await service.registerPushToken('tenant-1', 'user-1', 'ExponentPushToken[xxx]', 'ios');
      expect(result.ok).toBe(true);
    });

    it('upsert (conflict update)', async () => {
      mockPool.query.mockResolvedValueOnce({});
      await service.registerPushToken('tenant-1', 'user-1', 'token-1', 'android');
      const [sql] = mockPool.query.mock.calls[0]!;
      expect(sql).toContain('ON CONFLICT');
    });
  });

  describe('unregisterPushToken()', () => {
    it('push token deaktive eder', async () => {
      mockPool.query.mockResolvedValueOnce({});
      const result = await service.unregisterPushToken('tenant-1', 'token-1');
      expect(result.ok).toBe(true);
    });
  });

  describe('sendPushToTenant()', () => {
    it('token yoksa sent=0', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.sendPushToTenant('tenant-1', 'Title', 'Body');
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('Expo push API başarılı', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ token: 't-1' }, { token: 't-2' }],
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ status: 'ok' }, { status: 'ok' }] }), {
          status: 200,
        }),
      );
      const result = await service.sendPushToTenant('tenant-1', 'Title', 'Body');
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('Expo push API kısmi başarı', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ token: 't-1' }, { token: 't-2' }],
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ status: 'ok' }, { status: 'error' }] }),
          { status: 200 },
        ),
      );
      const result = await service.sendPushToTenant('tenant-1', 'T', 'B');
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('Expo push API hatası', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ token: 't-1' }],
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('error', { status: 500 }),
      );
      const result = await service.sendPushToTenant('tenant-1', 'T', 'B');
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('fetch exception', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ token: 't-1' }],
      });
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));
      const result = await service.sendPushToTenant('tenant-1', 'T', 'B');
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe('notifyOrderCreated()', () => {
    it('push gönderir', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await service.notifyOrderCreated('tenant-1', 'o-1', 'ORD-001');
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('notifyLowStock()', () => {
    it('push gönderir', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await service.notifyLowStock('tenant-1', 'Ürün X', 2);
      expect(mockPool.query).toHaveBeenCalled();
    });
  });
});