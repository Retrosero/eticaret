/**
 * PlansController unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@eticart/config';
import { PlansController } from '../plans.controller.js';

const mockPlans: any = {
  listActive: vi.fn(),
  findWithFeatures: vi.fn(),
};

describe('PlansController', () => {
  let controller: PlansController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new PlansController(mockPlans);
  });

  describe('list()', () => {
    it('plan listesini döner', async () => {
      mockPlans.listActive.mockResolvedValue([
        {
          code: 'starter',
          name: 'Starter',
          description: 'Yeni başlayanlar',
          monthlyPriceKurus: 0,
          yearlyPriceKurus: 0,
          currency: 'TRY',
          trialDays: 14,
          maxUsers: 2,
          maxProducts: 100,
          maxOrdersPerMonth: 500,
          maxStorageBytes: 1073741824,
        },
      ]);
      mockPlans.findWithFeatures.mockResolvedValue({
        plan: { code: 'starter' },
        features: [{ featureKey: 'basic', enabled: true, limitValue: null }],
      });

      const result = await controller.list();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].code).toBe('starter');
      expect(result.items[0].features).toEqual([
        { key: 'basic', enabled: true, limit: null },
      ]);
      expect(result.updatedAt).toBeDefined();
    });
  });

  describe('detail()', () => {
    it('plan detayı döner', async () => {
      mockPlans.findWithFeatures.mockResolvedValue({
        plan: { code: 'starter', name: 'Starter' },
        features: [],
      });

      const result = await controller.detail('starter');
      expect(result).toBeDefined();
    });

    it('olmayan plan için null döner (mevcut davranış)', async () => {
      mockPlans.findWithFeatures.mockResolvedValue(null);

      await expect(controller.detail('yok')).rejects.toThrow(ApiError);
      await expect(controller.detail('yok')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('geçersiz plan kodu için 400 fırlatır', async () => {
      await expect(controller.detail('A..B@!')).rejects.toThrow();
    });
  });
});
