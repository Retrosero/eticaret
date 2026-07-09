/**
 * robots.txt üretimi.
 *
 * Akıllı crawl rules:
 * - Public sayfalar → Allow
 * - Admin, sepet, ödeme, hesap → Disallow
 * - Sitemap URL'leri
 * - Crawl-delay (nazik bot'lara)
 */
import type { MetadataRoute } from 'next';
import { siteConfig } from './site-config.js';

export interface RobotsInput {
  /** Tenant slug (multi-tenant). */
  tenantSlug?: string;
  /** Sitemap URL'leri. */
  sitemaps?: string[];
  /** Ek Disallow kuralları. */
  additionalDisallow?: string[];
  /** Ek Allow kuralları. */
  additionalAllow?: string[];
}

export function buildRobots(input: RobotsInput = {}): MetadataRoute.Robots {
  const sitemapUrls = input.sitemaps ?? [`${siteConfig.url}/sitemap.xml`];

  const baseRules: MetadataRoute.Robots['rules'] = [
    // Tüm botlar için default
    {
      userAgent: '*',
      allow: ['/'],
      disallow: [
        // Hassas alanlar
        '/admin/',
        '/api/',
        '/hesap/',
        '/sepet/',
        '/odeme/',
        '/siparis-takip/',
        // Auth
        '/giris',
        '/kayit',
        '/sifremi-unuttum',
        '/sifre-sifirlama',
        // KVKK veri export (sensitive)
        '/api/customer/data-export',
        // Search/internal
        '/arama?*',
      ],
      crawlDelay: 1, // 1 saniye
    },
    // Googlebot — daha agresif crawl
    {
      userAgent: 'Googlebot',
      allow: ['/'],
      disallow: ['/api/', '/admin/', '/sepet/', '/odeme/'],
    },
    // Googlebot-Image
    {
      userAgent: 'Googlebot-Image',
      allow: ['/'],
    },
    // Bingbot
    {
      userAgent: 'Bingbot',
      allow: ['/'],
      disallow: ['/api/', '/admin/'],
    },
    // Bad bots
    {
      userAgent: ['AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot'],
      disallow: ['/'],
    },
    // AI training bot'ları (opsiyonel - izin istenirse allow yapılabilir)
    {
      userAgent: ['GPTBot', 'CCBot', 'anthropic-ai', 'Claude-Web', 'PerplexityBot'],
      allow: ['/blog/', '/'],
      disallow: ['/api/', '/admin/', '/hesap/'],
    },
  ];

  return {
    rules: baseRules,
    sitemap: sitemapUrls,
    host: siteConfig.url,
  };
}