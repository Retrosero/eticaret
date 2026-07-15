import { describe, expect, it, vi } from 'vitest';
import { StorefrontContentService } from '../storefront-content.service.js';

describe('StorefrontContentService', () => {
  it('bannerları tenant, placement ve yayın zamanı ile filtreler', async () => {
    const $queryRawUnsafe = vi.fn().mockResolvedValue([{
      id: 'banner-1', title: 'Yaz', subtitle: null, image_key: 'hero.jpg', image_mobile_key: null,
      cta_label: 'İncele', cta_href: '/yaz', sort_order: 1,
    }]);
    const service = new StorefrontContentService({ client: { $queryRawUnsafe } } as never);

    const result = await service.banners('tenant-a', 'home-hero');

    expect(result[0]).toMatchObject({ id: 'banner-1', imageUrl: 'hero.jpg', order: 1 });
    expect($queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("status = 'published'"), 'tenant-a', 'home-hero');
  });

  it('blog ve testimonial sonuçlarını SDK formatına map eder', async () => {
    const $queryRawUnsafe = vi.fn()
      .mockResolvedValueOnce([{ id: 'post-1', slug: 'duyuru', title: 'Duyuru', excerpt: 'Metin', image_key: null, published_at: '2026-07-11T00:00:00.000Z', reading_time_min: 3 }])
      .mockResolvedValueOnce([{ id: 'review-1', customer_name: 'Ada', customer_title: null, rating: 5, comment: 'Harika', avatar_key: null, approved_at: '2026-07-11T00:00:00.000Z' }]);
    const service = new StorefrontContentService({ client: { $queryRawUnsafe } } as never);

    await expect(service.blogPosts('tenant-a', 3)).resolves.toMatchObject([{ readingTimeMin: 3 }]);
    await expect(service.testimonials('tenant-a', 3)).resolves.toMatchObject([{ customerName: 'Ada', rating: 5 }]);
  });
});
