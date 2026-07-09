/**
 * XML Sitemap generator — Next.js App Router.
 *
 * Google Search Console için optimize edilmiş sitemap.
 * - Statik sayfalar (anasayfa, hakkımızda, KVKK, vs.)
 * - Dinamik sayfalar (ürün, kategori, marka)
 * - Hreflang alternatif URL'ler
 *
 * Kullanım:
 *   app/sitemap.ts → revalidate=3600 (1 saat)
 */
import type { MetadataRoute } from 'next';
import { siteConfig } from './site-config.js';

export interface SitemapEntry {
  /** URL path (örn. /urun/iphone-15) */
  path: string;
  /** Son güncelleme zamanı (ISO 8601). */
  lastModified?: string | Date;
  /** Değişim sıklığı. */
  changeFrequency?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never';
  /** Öncelik (0.0 - 1.0). */
  priority?: number;
  /** Hreflang alternatifleri. */
  alternates?: Record<string, string>;
}

export interface SitemapInput {
  /** Statik sayfalar. */
  staticPages?: SitemapEntry[];
  /** Tenant ürün/kategori URL'leri (API'den çekilir). */
  dynamicPages?: () => Promise<SitemapEntry[]>;
  /** Tenant slug (multi-tenant). */
  tenantSlug?: string;
}

const HREF_LANG_LOCALES = ['tr-TR', 'en-US'] as const;

/**
 * Base URL — tenant subdomain'e göre.
 */
function baseUrl(): string {
  const base = siteConfig.url.replace(/\/$/, '');
  return base;
}

/**
 * Sitemap entry'leri MetadataRoute.Sitemap formatına dönüştür.
 */
function toSitemapUrl(entry: SitemapEntry, tenantSlug?: string): MetadataRoute.Sitemap[number] {
  let url = baseUrl();
  let path = entry.path;

  if (tenantSlug) {
    const u = new URL(siteConfig.url);
    u.host = `${tenantSlug}.${u.host}`;
    url = u.toString().replace(/\/$/, '');
  }

  if (path !== '/' && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return {
    url: `${url}${path}`,
    lastModified: entry.lastModified ? new Date(entry.lastModified) : new Date(),
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
    alternates: entry.alternates
      ? {
          languages: entry.alternates,
        }
      : undefined,
  };
}

/**
 * Statik sayfalar (anasayfa, hakkımızda, KVKK, vs.).
 */
export const defaultStaticPages: SitemapEntry[] = [
  {
    path: '/',
    changeFrequency: 'daily',
    priority: 1.0,
    alternates: { 'tr-TR': `${siteConfig.url}/`, 'en-US': `${siteConfig.url}/en` },
  },
  {
    path: '/urunler',
    changeFrequency: 'hourly',
    priority: 0.9,
    alternates: { 'tr-TR': `${siteConfig.url}/urunler`, 'en-US': `${siteConfig.url}/en/products` },
  },
  {
    path: '/kategoriler',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    path: '/markalar',
    changeFrequency: 'weekly',
    priority: 0.7,
  },
  {
    path: '/kampanyalar',
    changeFrequency: 'daily',
    priority: 0.8,
  },
  {
    path: '/hakkimizda',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: '/iletisim',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: '/blog',
    changeFrequency: 'daily',
    priority: 0.7,
  },
  {
    path: '/sss',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  // Yasal
  {
    path: '/kvkk',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/cerez-politikasi',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/gizlilik-politikasi',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/kullanim-kosullari',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/iade-ve-degisim',
    changeFrequency: 'yearly',
    priority: 0.4,
  },
  {
    path: '/mesafeli-satis-sozlesmesi',
    changeFrequency: 'yearly',
    priority: 0.4,
  },
];

/**
 * Sitemap üret.
 *
 * Next.js App Router'da `app/sitemap.ts` dosyasından döndürülür.
 */
export async function buildSitemap(input: SitemapInput = {}): Promise<any> {
  const staticUrls = (input.staticPages ?? defaultStaticPages).map((e) =>
    toSitemapUrl(e, input.tenantSlug)
  );

  const dynamicUrls: MetadataRoute.Sitemap = input.dynamicPages
    ? (await input.dynamicPages()).map((e) => toSitemapUrl(e, input.tenantSlug))
    : [];

  return [...staticUrls, ...dynamicUrls];
}

/**
 * Sitemap Index — birden fazla sitemap varsa.
 */
export async function buildSitemapIndex(sitemaps: Array<{ id: string; lastModified?: Date }>): Promise<any> {
  return sitemaps.map((sm) => ({
    url: `${baseUrl()}/sitemap/${sm.id}.xml`,
    lastModified: sm.lastModified ?? new Date(),
  }));
}

/**
 * Ürün sitemap'i — büyük siteler için ayrı sitemap.
 */
export async function buildProductsSitemap(products: Array<{
  slug: string;
  updatedAt?: string | Date;
}>): Promise<any> {
  return products.map((p) => ({
    url: `${baseUrl()}/urun/${p.slug}`,
    lastModified: p.updatedAt ? new Date(p.updatedAt) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
    alternates: {
      'tr-TR': `${baseUrl()}/urun/${p.slug}`,
      'en-US': `${baseUrl()}/en/product/${p.slug}`,
    },
  }));
}

/**
 * Kategori sitemap'i.
 */
export async function buildCategoriesSitemap(categories: Array<{
  slug: string;
  updatedAt?: string | Date;
}>): Promise<any> {
  return categories.map((c) => ({
    url: `${baseUrl()}/kategori/${c.slug}`,
    lastModified: c.updatedAt ? new Date(c.updatedAt) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));
}