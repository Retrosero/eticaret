/**
 * Site yapılandırması — runtime'da env'den okunur.
 *
 * Tenant başına override edilemez; site config platform düzeyindedir.
 * Her tenant'ın mağaza URL'si ayrıdır (`<tenant>.eticart.com.tr`) ama site
 * config'i aynıdır.
 */
import type { SiteConfig } from './types.js';

const env = process.env;

/**
 * Production URL — canonical için.
 *
 * Tenant subdomain'ler için `site.url` tenant bazlı override edilir.
 * Default: https://eticart.com.tr
 */
function resolveBaseUrl(): string {
  const fromEnv = env['NEXT_PUBLIC_SITE_URL'];
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (env['VERCEL_URL']) return `https://${env['VERCEL_URL']}`;

  return 'http://localhost:3000';
}

export const siteConfig: SiteConfig = {
  name: env['NEXT_PUBLIC_SITE_NAME'] ?? 'EtiCart',
  shortName: 'EtiCart',
  description:
    env['NEXT_PUBLIC_SITE_DESCRIPTION'] ??
    'Türkiye\'nin modern e-ticaret platformu — KVKK uyumlu, çok kiracılı, açık kaynak. Binlerce KOBİ ve kurumsal şirketin tercihi.',
  url: resolveBaseUrl(),
  locale: 'tr_TR',
  alternateLocale: 'en_US',
  social: {
    twitter: env['NEXT_PUBLIC_TWITTER'] ?? '@eticart',
    facebook: env['NEXT_PUBLIC_FACEBOOK'] ?? 'https://facebook.com/eticart',
    instagram: env['NEXT_PUBLIC_INSTAGRAM'] ?? 'https://instagram.com/eticart',
    linkedin: env['NEXT_PUBLIC_LINKEDIN'] ?? 'https://linkedin.com/company/eticart',
    youtube: env['NEXT_PUBLIC_YOUTUBE'],
  },
  googleSiteVerification: env['NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION'],
  yandexVerification: env['NEXT_PUBLIC_YANDEX_VERIFICATION'],
  defaultOgImage: `${resolveBaseUrl()}/og-image.png`,
  logo: `${resolveBaseUrl()}/logo.png`,
  organizationType: 'OnlineStore',
};

/**
 * Tenant bazlı URL — admin tarafından özelleştirilebilir.
 *
 * @param tenantSlug - örn. "demo" → https://demo.eticart.com.tr
 */
export function tenantSiteUrl(tenantSlug: string): string {
  const base = siteConfig.url;
  if (env['NEXT_PUBLIC_TENANT_SUBDOMAINS'] === 'true') {
    return `${base.replace(/:\d+$/, '')}/m/${tenantSlug}`;
  }
  return `${base}/m/${tenantSlug}`;
}