import { describe, expect, it, vi } from 'vitest';
import { StorefrontProductsService } from '../storefront-products.service.js';

const product = {
  id: 'product-1', slug: 'mavi-gomlek', title: 'Mavi Gömlek', short_description: 'Pamuklu',
  description: 'Detay', brand_id: 'brand-1', brand_name: 'Demo Marka', price_amount: '125.5',
  currency: 'TRY' as const, stock_qty: 4, reserved_qty: 1, main_image_url: 'products/1.jpg',
  updated_at: new Date('2026-07-11T00:00:00.000Z'), published_at: new Date('2026-07-10T00:00:00.000Z'),
};

describe('StorefrontProductsService', () => {
  it('listeyi tenant ve aktif ürün filtresiyle döner', async () => {
    const $queryRawUnsafe = vi.fn()
      .mockResolvedValueOnce([product])
      .mockResolvedValueOnce([{ total: '1' }]);
    const service = new StorefrontProductsService({ client: { $queryRawUnsafe } } as never);

    const result = await service.list('tenant-a', { pageSize: '8', in_stock: '1' });

    expect(result.items[0]).toMatchObject({ slug: 'mavi-gomlek', priceKurus: 12550, inStock: true });
    expect(result.total).toBe(1);
    expect($queryRawUnsafe).toHaveBeenNthCalledWith(1, expect.stringContaining('p."tenantId" = $1::uuid'), 'tenant-a', 8, 0);
  });

  it('detay bulunamazsa null döner', async () => {
    const $queryRawUnsafe = vi.fn().mockResolvedValueOnce([]);
    const service = new StorefrontProductsService({ client: { $queryRawUnsafe } } as never);

    await expect(service.detail('tenant-b', 'yok')).resolves.toBeNull();
    expect($queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('p."tenantId" = $1::uuid'), 'tenant-b', 'yok');
  });
});
