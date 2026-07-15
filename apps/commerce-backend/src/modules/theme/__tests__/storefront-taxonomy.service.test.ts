import { describe, expect, it, vi } from 'vitest';
import { StorefrontTaxonomyService } from '../storefront-taxonomy.service.js';

describe('StorefrontTaxonomyService', () => {
  it('kategori ağacını parent-child ilişkisiyle kurar', async () => {
    const $queryRawUnsafe = vi.fn().mockResolvedValue([
      { id: 'root', tenant_id: 'tenant-a', parent_id: null, slug: 'giyim', name: 'Giyim', description: null, image_url: null, product_count: '3' },
      { id: 'child', tenant_id: 'tenant-a', parent_id: 'root', slug: 'gomlek', name: 'Gömlek', description: 'Gömlekler', image_url: null, product_count: '2' },
    ]);
    const service = new StorefrontTaxonomyService({ client: { $queryRawUnsafe } } as never);

    const result = await service.categories('tenant-a');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ slug: 'giyim', productCount: 3 });
    expect(result[0]?.children[0]).toMatchObject({ slug: 'gomlek', productCount: 2 });
    expect($queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('c."tenantId" = $1::uuid'), 'tenant-a');
  });

  it('bulunamayan kategori için null döner', async () => {
    const $queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const service = new StorefrontTaxonomyService({ client: { $queryRawUnsafe } } as never);

    await expect(service.categoryBySlug('tenant-b', 'yok')).resolves.toBeNull();
  });
});
