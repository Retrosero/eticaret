/**
 * Next.js Metadata builder.
 *
 * PageSEO → Next.js Metadata dönüşümü. Her sayfa `buildMetadata()` çağırarak
 * eksiksiz meta tag üretir (title, description, OG, Twitter, canonical, robots).
 */
import type { Metadata } from 'next';
import type { PageSEO, SiteConfig } from './types.js';
import { siteConfig } from './site-config.js';

/**
 * Verilen PageSEO'yu Next.js Metadata objesine dönüştürür.
 */
export function buildMetadata(
  page: PageSEO,
  options?: {
    site?: SiteConfig;
    /** Tenant slug (tenant bazlı canonical için). */
    tenantSlug?: string;
    /** Şu anki path (canonical için). */
    currentPath?: string;
  }
): Metadata {
  const site = options?.site ?? siteConfig;
  const url = buildCanonicalUrl(site, options?.tenantSlug, options?.currentPath ?? page.path ?? '/');

  const ogImage = page.ogImage ?? site.defaultOgImage;

  // Robots
  const robots: Metadata['robots'] = page.noindex || page.nofollow
    ? {
        index: !page.noindex,
        follow: !page.nofollow,
        googleBot: {
          index: !page.noindex,
          follow: !page.nofollow,
          'max-image-preview': 'large',
          'max-snippet': -1,
        },
      }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-image-preview': 'large',
          'max-snippet': -1,
          'max-video-preview': -1,
        },
      };

  const metadata: Metadata = {
    title: page.title,
    description: page.description,
    keywords: page.tags?.join(', '),
    authors: page.author ? [{ name: page.author }] : undefined,
    creator: site.name,
    publisher: site.name,
    formatDetection: { telephone: false, email: false, address: false },
    alternates: {
      canonical: url,
      languages: page.alternates?.languages,
    },
    openGraph: {
      type: ((page.type as any) ?? 'website') as 'website',
      locale: site.locale,
      alternateLocale: site.alternateLocale,
      title: page.title,
      description: page.description,
      url,
      siteName: site.name,
      images: ogImage
        ? [
            {
              url: ogImage,
              width: 1200,
              height: 630,
              alt: page.title,
              type: 'image/png',
            },
          ]
        : undefined,
      publishedTime: page.publishedTime,
      modifiedTime: page.modifiedTime,
      authors: page.author ? [page.author] : undefined,
      section: page.section,
      tags: page.tags,
    } as any,
    twitter: {
      card: 'summary_large_image',
      site: site.social?.twitter,
      creator: site.social?.twitter,
      title: page.title,
      description: page.description,
      images: ogImage ? [ogImage] : undefined,
    },
    robots,
    other: {
      'X-UA-Compatible': 'IE=edge',
      ...(site.googleSiteVerification
        ? { 'google-site-verification': site.googleSiteVerification }
        : {}),
      ...(site.yandexVerification
        ? { 'yandex-verification': site.yandexVerification }
        : {}),
    },
  };

  return metadata;
}

/**
 * Canonical URL üret.
 *
 * Path'ten trailing slash normalize edilir.
 * Query string kaldırılır (tracking param'ları için).
 */
export function buildCanonicalUrl(
  site: SiteConfig,
  tenantSlug: string | undefined,
  path: string
): string {
  // Tenant path prefix
  let base = site.url;
  let fullPath = path;

  if (tenantSlug) {
    // Multi-tenant: /m/<tenant>/path veya <tenant>.eticart.com.tr/path
    if (site.url.includes('localhost')) {
      // Dev mode
      fullPath = `/m/${tenantSlug}${path === '/' ? '' : path}`;
    } else {
      // Prod: subdomain
      const u = new URL(site.url);
      u.host = `${tenantSlug}.${u.host}`;
      base = u.toString().replace(/\/$/, '');
    }
  }

  // Normalize path
  if (fullPath !== '/' && fullPath.endsWith('/')) {
    fullPath = fullPath.slice(0, -1);
  }

  return `${base}${fullPath}`;
}

/**
 * URL yardımcıları.
 */
export function absoluteUrl(path: string, base?: string): string {
  const baseUrl = base ?? siteConfig.url;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}