/**
 * SEO utilities testleri.
 *
 * buildMetadata, schemas, sitemap, robots için type-safety ve doğruluk testleri.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMetadata,
  buildCanonicalUrl,
  buildSitemap,
  buildProductsSitemap,
  buildCategoriesSitemap,
  buildRobots,
  organizationSchema,
  websiteSchema,
  productSchema,
  breadcrumbSchema,
  faqSchema,
  articleSchema,
  itemListSchema,
  defaultStaticPages,
  absoluteUrl,
} from '../index.js';
import { siteConfig } from '../site-config.js';

describe('SEO: site-config', () => {
  it('siteConfig URL trailing slash içermez', () => {
    expect(siteConfig.url).not.toMatch(/\/$/);
  });

  it('siteConfig varsayılan değerlere sahip', () => {
    expect(siteConfig.name).toBeTruthy();
    expect(siteConfig.description).toBeTruthy();
    expect(siteConfig.locale).toMatch(/tr_TR|en_US/);
  });
});

describe('SEO: buildMetadata', () => {
  it('Temel meta alanları', () => {
    const m = buildMetadata({
      title: 'Test Sayfa',
      description: 'Test açıklama',
      path: '/test',
    });

    expect(m.title).toBe('Test Sayfa');
    expect(m.description).toBe('Test açıklama');
    expect(m.alternates?.canonical).toContain('/test');
  });

  it('Open Graph meta', () => {
    const m = buildMetadata({
      title: 'OG Test',
      description: 'OG açıklama',
      path: '/og',
      type: 'article',
    });

    expect(m.openGraph?.title).toBe('OG Test');
    expect(m.openGraph?.description).toBe('OG açıklama');
    expect(m.openGraph?.type).toBe('article');
    expect(m.openGraph?.locale).toBe(siteConfig.locale);
  });

  it('Twitter Card meta', () => {
    const m = buildMetadata({
      title: 'Twitter',
      description: 'TW desc',
      path: '/tw',
    });

    expect(m.twitter?.card).toBe('summary_large_image');
    expect(m.twitter?.title).toBe('Twitter');
  });

  it('noindex/nofollow', () => {
    const m = buildMetadata({
      title: 'Private',
      description: 'Private',
      path: '/p',
      noindex: true,
      nofollow: true,
    });

    expect(m.robots?.index).toBe(false);
    expect(m.robots?.follow).toBe(false);
  });

  it('Alternates (hreflang)', () => {
    const m = buildMetadata({
      title: 'Multi',
      description: 'Multi lang',
      path: '/multi',
      alternates: {
        languages: {
          'tr-TR': '/tr/multi',
          'en-US': '/en/multi',
        },
      },
    });

    expect(m.alternates?.languages).toEqual({
      'tr-TR': '/tr/multi',
      'en-US': '/en/multi',
    });
  });

  it('OG image dimensions', () => {
    const m = buildMetadata({
      title: 'Image Test',
      description: 'IMG',
      path: '/img',
      ogImage: 'https://cdn.eticart.com.tr/og/test.jpg',
    });

    const ogImage = m.openGraph?.images?.[0];
    expect(ogImage?.url).toBe('https://cdn.eticart.com.tr/og/test.jpg');
    expect(ogImage?.width).toBe(1200);
    expect(ogImage?.height).toBe(630);
  });

  it('Article meta — publishedTime, author', () => {
    const m = buildMetadata({
      title: 'Blog Post',
      description: 'Blog desc',
      path: '/blog/test',
      type: 'article',
      author: 'Ali Yılmaz',
      publishedTime: '2026-07-04T10:00:00Z',
      section: 'Teknoloji',
      tags: ['e-ticaret', 'KVKK'],
    });

    expect(m.openGraph?.type).toBe('article');
    expect(m.openGraph?.publishedTime).toBe('2026-07-04T10:00:00Z');
    expect(m.authors?.[0]?.name).toBe('Ali Yılmaz');
  });
});

describe('SEO: buildCanonicalUrl', () => {
  it('Trailing slash kaldırılır', () => {
    const url = buildCanonicalUrl(siteConfig, undefined, '/test/');
    expect(url).not.toMatch(/\/$/);
    expect(url).toContain('/test');
  });

  it('Root path canonical', () => {
    const url = buildCanonicalUrl(siteConfig, undefined, '/');
    expect(url.replace(/\/$/, '')).toBe(siteConfig.url);
  });

  it('Tenant subdomain URL', () => {
    const url = buildCanonicalUrl(siteConfig, 'demo', '/urun/abc');
    if (!siteConfig.url.includes('localhost')) expect(url).toContain('demo.');
  });
});

describe('SEO: Schemas', () => {
  it('organizationSchema — required fields', () => {
    const s = organizationSchema();
    expect(s['@context']).toBe('https://schema.org');
    expect(s['@type']).toMatch(/Organization|Store|OnlineStore/);
    expect(s.name).toBe(siteConfig.name);
    expect(s.url).toBe(siteConfig.url);
    expect(s.logo).toBeTruthy();
  });

  it('organizationSchema — sameAs sosyal medya', () => {
    const s = organizationSchema();
    expect(Array.isArray(s.sameAs)).toBe(true);
  });

  it('websiteSchema — SearchAction', () => {
    const s = websiteSchema();
    expect(s.potentialAction?.['@type']).toBe('SearchAction');
    expect(s.potentialAction?.target.urlTemplate).toContain('/arama');
  });

  it('productSchema — Offer with availability mapping', () => {
    const s = productSchema({
      id: 'p1',
      name: 'Test',
      sku: 'TEST-001',
      brandName: 'TestBrand',
      url: '/urun/test',
      price: 99.99,
      currency: 'TRY',
      availability: 'in_stock',
    });

    expect(s['@type']).toBe('Product');
    expect(s.offers?.['@type']).toBe('Offer');
    expect((s.offers as any)?.availability).toBe('https://schema.org/InStock');
    expect(s.offers?.priceCurrency).toBe('TRY');
  });

  it('productSchema — out_of_stock mapping', () => {
    const s = productSchema({
      id: 'p1',
      name: 'Test',
      sku: 'TEST-002',
      brandName: 'TestBrand',
      url: '/urun/test',
      price: 0,
      currency: 'TRY',
      availability: 'out_of_stock',
    });
    expect((s.offers as any)?.availability).toBe('https://schema.org/OutOfStock');
  });

  it('productSchema — aggregateRating', () => {
    const s = productSchema({
      id: 'p1',
      name: 'Test',
      sku: 'TEST-003',
      brandName: 'TestBrand',
      url: '/urun/test',
      price: 50,
      currency: 'TRY',
      availability: 'in_stock',
      ratingValue: 4.5,
      reviewCount: 100,
    });
    expect(s.aggregateRating?.ratingValue).toBe(4.5);
    expect(s.aggregateRating?.reviewCount).toBe(100);
    expect(s.aggregateRating?.bestRating).toBe(5);
  });

  it('breadcrumbSchema — sıralı liste', () => {
    const s = breadcrumbSchema([
      { name: 'Anasayfa', url: '/' },
      { name: 'Elektronik', url: '/kategori/elektronik' },
      { name: 'iPhone 15', url: '/urun/iphone-15' },
    ]);
    expect(s.itemListElement.length).toBe(3);
    expect(s.itemListElement[0]?.position).toBe(1);
    expect(s.itemListElement[2]?.position).toBe(3);
    expect(s.itemListElement[1]?.name).toBe('Elektronik');
  });

  it('faqSchema — soru/cevap', () => {
    const s = faqSchema([
      { question: 'Kargo ne kadar?', answer: '100 TL üzeri ücretsiz.' },
      { question: 'İade var mı?', answer: '14 gün içinde iade edebilirsiniz.' },
    ]);
    expect(s['@type']).toBe('FAQPage');
    expect(s.mainEntity.length).toBe(2);
    expect(s.mainEntity[0]?.name).toBe('Kargo ne kadar?');
    expect(s.mainEntity[0]?.acceptedAnswer.text).toContain('ücretsiz');
  });

  it('articleSchema — yayın bilgileri', () => {
    const s = articleSchema({
      title: 'Blog',
      description: 'Desc',
      url: '/blog/x',
      publishedTime: '2026-07-01T10:00:00Z',
      authorName: 'Ali',
    });
    expect(s.datePublished).toBe('2026-07-01T10:00:00Z');
    expect((s.author as any)?.name).toBe('Ali');
    expect((s.publisher as any)?.['@type']).toBe('Organization');
  });

  it('itemListSchema — pozisyonlar', () => {
    const s = itemListSchema({
      name: 'Popüler',
      url: '/',
      items: [
        { name: 'A', url: '/a', position: 1 },
        { name: 'B', url: '/b', position: 2 },
      ],
    });
    expect(s.itemListElement[0]?.position).toBe(1);
  });
});

describe('SEO: Sitemap', () => {
  it('defaultStaticPages — önemli sayfalar içerilir', () => {
    const paths = defaultStaticPages.map((p) => p.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/urunler');
    expect(paths).toContain('/kvkk');
    expect(paths).toContain('/iletisim');
  });

  it('defaultStaticPages — yasal sayfalar düşük priority', () => {
    const kvkk = defaultStaticPages.find((p) => p.path === '/kvkk');
    expect(kvkk?.priority).toBeLessThanOrEqual(0.4);
  });

  it('buildSitemap — statik + dinamik birleştirilir', async () => {
    const dynamicPages = async () => [
      { path: '/urun/x', priority: 0.8 },
      { path: '/urun/y', priority: 0.8 },
    ];

    const sitemap = await buildSitemap({ dynamicPages });
    expect(sitemap.length).toBe(defaultStaticPages.length + 2);
  });

  it('buildProductsSitemap — URL format', async () => {
    const sitemap = await buildProductsSitemap([
      { slug: 'iphone-15' },
      { slug: 'macbook-pro' },
    ]);
    expect(sitemap[0]?.url).toContain('/urun/iphone-15');
    expect(sitemap[1]?.url).toContain('/urun/macbook-pro');
    expect(sitemap[0]?.priority).toBe(0.8);
  });

  it('buildCategoriesSitemap', async () => {
    const sitemap = await buildCategoriesSitemap([
      { slug: 'elektronik' },
    ]);
    expect(sitemap[0]?.url).toContain('/kategori/elektronik');
  });

  it('Sitemap URL trailing slash içermez', async () => {
    const sitemap = await buildSitemap({
      staticPages: [{ path: '/test/' }],
    });
    expect(sitemap.find((e) => e.url.includes('test'))?.url).not.toMatch(/\/$/);
  });
});

describe('SEO: Robots', () => {
  it('buildRobots — default rules', () => {
    const r = buildRobots();
    expect(r.rules.length).toBeGreaterThan(0);
    expect(r.sitemap).toBeDefined();
    expect(r.host).toBe(siteConfig.url);
  });

  it('Hassas alanlar Disallow', () => {
    const r = buildRobots();
    const defaultRule = r.rules.find((rule) =>
      typeof rule.userAgent === 'string' && rule.userAgent === '*'
    );
    expect(defaultRule).toBeDefined();
    const disallow = (defaultRule as any)?.disallow ?? [];
    expect(disallow).toContain('/admin/');
    expect(disallow).toContain('/api/');
    expect(disallow).toContain('/sepet/');
    expect(disallow).toContain('/odeme/');
  });

  it('Bad bots tamamen engellenir', () => {
    const r = buildRobots();
    const badBotRule = r.rules.find((rule: any) =>
      Array.isArray(rule.userAgent) && rule.userAgent.includes('AhrefsBot')
    );
    expect(badBotRule).toBeDefined();
    expect((badBotRule as any)?.disallow).toContain('/');
  });

  it('Sitemap URL listelenir', () => {
    const r = buildRobots({ sitemaps: ['https://example.com/sitemap.xml'] });
    expect(r.sitemap).toContain('https://example.com/sitemap.xml');
  });
});

describe('SEO: absoluteUrl', () => {
  it('Path normalize edilir', () => {
    expect(absoluteUrl('test')).toContain('/test');
    expect(absoluteUrl('/test')).toContain('/test');
  });

  it('Custom base URL', () => {
    const url = absoluteUrl('/path', 'https://custom.com');
    expect(url).toBe('https://custom.com/path');
  });
});