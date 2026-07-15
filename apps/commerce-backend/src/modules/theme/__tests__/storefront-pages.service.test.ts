import { describe, expect, it, vi } from 'vitest';
import { StorefrontPagesService } from '../storefront-pages.service.js';

describe('StorefrontPagesService', () => {
  it('yalnızca yayınlanmış revision bloklarını storefront payload formatına çevirir', async () => {
    const $queryRawUnsafe = vi
      .fn()
      .mockResolvedValueOnce([{
        id: 'page-1',
        slug: 'home',
        title: 'Mağaza',
        type: 'home',
        status: 'published',
        updated_at: new Date('2026-07-11T00:00:00.000Z'),
        blocks: [
          { id: 'hero-1', type: 'hero', order: 2, settings: { title: 'Merhaba' } },
          { id: 'broken', settings: {} },
          { id: 'products-1', type: 'featured-products', order: 1, visibility: { mobile: false } },
        ],
      }])
      .mockResolvedValueOnce([{
        title_template: '%s | Demo',
        default_title: 'Demo',
        default_description: 'Açıklama',
        default_og_image: null,
        canonical_base: 'https://demo.example',
        robots: 'index, follow',
      }]);
    const service = new StorefrontPagesService({ client: { $queryRawUnsafe } } as never);

    const result = await service.getPage('tenant-a', 'home') as any;

    expect(result.blocks.map((block: any) => block.type)).toEqual(['featured-products', 'hero']);
    expect(result.blocks[0].visibility).toEqual({ desktop: true, mobile: false });
    expect(result.seo.canonicalUrl).toBe('https://demo.example/');
    expect($queryRawUnsafe).toHaveBeenNthCalledWith(1, expect.stringContaining("p.status = 'published'"), 'tenant-a', 'home');
  });
});
