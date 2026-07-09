/**
 * Runtime yardımcıları — server tarafında Next.js ile entegre çalışır.
 *
 * Bu modül, `ResolvedTheme`'den gerçek HTML/Metadata çıktısı üreten küçük
 * yardımcıları içerir:
 *  - `<style>` tag'i ile CSS değişkenlerini inline enjekte etme
 *  - `cacheTag` üretimi (Next.js tag-based invalidation)
 *  - Canonical URL çözümlemesi
 *  - Header/footer için tema varyantına göre `data-variant` çıktısı
 *
 * Not: Bu modül React'e bağımlı değildir; Next.js app dizininde kullanılır.
 */

import type {
  DesignTokenValues,
  ResolvedTheme,
  SEOSetting,
} from '../types/index.js';
import { tokensToCssVariables, tokenKeyToCssVar } from '../tokens/index.js';

/**
 * CSS değişkenlerini inline `<style>` tag'i olarak döner.
 *
 * Next.js App Router'da layout içinde kullanılır:
 *   <style id="theme-tokens">{getThemeStyleTags(theme)}</style>
 */
export function getThemeStyleTags(theme: ResolvedTheme): string {
  return tokensToCssVariables(theme.tokens, ':root');
}

/** Tenant override edilen font URL'si (Google Fonts). */
export function getGoogleFontLink(theme: ResolvedTheme): string | null {
  const headingFont = theme.tokens['font.heading'];
  const bodyFont = theme.tokens['font.body'];
  const fonts: string[] = [];
  if (typeof headingFont === 'string' && !headingFont.startsWith('system')) {
    fonts.push(headingFont);
  }
  if (
    typeof bodyFont === 'string' &&
    bodyFont !== headingFont &&
    !bodyFont.startsWith('system')
  ) {
    fonts.push(bodyFont);
  }
  if (fonts.length === 0) return null;
  const family = fonts
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${family}&display=swap`;
}

/** Tema sürümüne göre Next.js cache tag listesi. */
export function getCacheTags(theme: ResolvedTheme): string[] {
  return [
    `tenant-theme:${theme.assignmentId}`,
    `theme:${theme.manifest.id}`,
    `theme:${theme.manifest.id}@${theme.manifest.version}`,
  ];
}

/** Sayfa bazında cache tag listesi. */
export function getPageCacheTags(input: {
  tenantId: string;
  slug: string;
  type: string;
}): string[] {
  return [
    `tenant:${input.tenantId}:page:${input.slug}`,
    `tenant:${input.tenantId}:pages`,
    `tenant:${input.tenantId}:page-type:${input.type}`,
  ];
}

/** Ürün bazında cache tag listesi (Faz 4 entegrasyonu için). */
export function getProductCacheTags(input: {
  tenantId: string;
  productId: string;
  categorySlugs: ReadonlyArray<string>;
}): string[] {
  const tags = [
    `tenant:${input.tenantId}:product:${input.productId}`,
    `tenant:${input.tenantId}:products`,
  ];
  for (const slug of input.categorySlugs) {
    tags.push(`tenant:${input.tenantId}:category:${slug}`);
  }
  return tags;
}

/**
 * Canonical URL — yedek domain'lerden gelen istekleri birincil domain'e
 * yönlendirmek için kullanılır.
 *
 * Öncelik:
 *   1. SEOSetting.canonicalBase (varsa)
 *   2. ResolvedTheme içindeki header menüdeki primary domain
 *   3. Aksi halde: girdi URL'si aynen döner
 */
export function buildCanonicalUrl(input: {
  path: string;
  seo: SEOSetting;
  primaryDomain?: string | null;
  requestHost?: string | null;
}): string {
  const base = input.seo.canonicalBase ?? input.primaryDomain ?? input.requestHost ?? '';
  if (!base) return input.path;
  const trimmedBase = base.replace(/\/+$/, '');
  const trimmedPath = input.path.startsWith('/') ? input.path : `/${input.path}`;
  return `${trimmedBase}${trimmedPath}`;
}

/** Header için `data-variant` attribute değeri. */
export function headerVariantAttr(theme: ResolvedTheme): string {
  const variant = theme.tokens['variant.header'] ?? 'classic';
  return typeof variant === 'string' ? variant : 'classic';
}

/** Footer için `data-variant` attribute değeri. */
export function footerVariantAttr(theme: ResolvedTheme): string {
  const variant = theme.tokens['variant.footer'] ?? 'four-column';
  return typeof variant === 'string' ? variant : 'four-column';
}

/**
 * Sayfa bazlı CSS class çıktısı. Tailwind veya CSS modules ile birlikte
 * kullanılabilir.
 */
export function themeClassName(theme: ResolvedTheme): string {
  return `theme-${theme.manifest.id}`;
}

/** Tenant override'ı uygulanmış aktif token değerlerini döner. */
export function activeTokens(theme: ResolvedTheme): DesignTokenValues {
  return theme.tokens;
}

/** Aktif bir CSS değişkeninin değerini döner. */
export function cssVarValue(
  theme: ResolvedTheme,
  tokenKey: string,
): string | number | undefined {
  return theme.tokens[tokenKey];
}

/**
 * Acil durum: tema yüklenemediğinde varsayılan (boş) tema.
 * SSR sırasında hata fırlatmak yerine güvenli fallback.
 */
export function fallbackResolvedTheme(): ResolvedTheme {
  return {
    manifest: {
      id: 'fallback',
      name: 'Varsayılan',
      description: 'Acil durum teması',
      author: 'eticart',
      version: '0.0.0',
      screenshots: [],
      tokens: {
        'color.primary': '#1f6feb',
        'color.background': '#ffffff',
        'color.text': '#1c1c1c',
        'font.heading': 'Inter, system-ui, sans-serif',
        'font.body': 'Inter, system-ui, sans-serif',
        'radius.base': '4px',
      },
      layouts: ['default'],
      blocks: [],
      variants: {
        header: ['classic'],
        footer: ['three-column'],
        productCard: ['vertical'],
        categoryPage: ['top-filter'],
        productDetailGallery: ['classic'],
      },
      minPlatformVersion: '5.0.0',
    },
    tokens: {
      'color.primary': '#1f6feb',
      'color.background': '#ffffff',
      'color.text': '#1c1c1c',
      'font.heading': 'Inter, system-ui, sans-serif',
      'font.body': 'Inter, system-ui, sans-serif',
      'radius.base': '4px',
    },
    variants: {
      header: ['classic'],
      footer: ['three-column'],
      productCard: ['vertical'],
      categoryPage: ['top-filter'],
      productDetailGallery: ['classic'],
    },
    headerMenu: {
      id: '00000000-0000-0000-0000-000000000000',
      tenantId: '00000000-0000-0000-0000-000000000000',
      type: 'header',
      status: 'published',
      items: [],
      updatedAt: new Date(0).toISOString(),
    },
    footerMenu: {
      id: '00000000-0000-0000-0000-000000000000',
      tenantId: '00000000-0000-0000-0000-000000000000',
      type: 'footer',
      status: 'published',
      items: [],
      updatedAt: new Date(0).toISOString(),
    },
    logoUrl: null,
    faviconUrl: null,
    seo: {
      tenantId: '00000000-0000-0000-0000-000000000000',
      titleTemplate: '%s',
      defaultTitle: 'Mağaza',
      defaultDescription: '',
      defaultOgImage: null,
      robots: 'index, follow',
      sitemapEnabled: true,
      canonicalBase: null,
      scripts: [],
      updatedAt: new Date(0).toISOString(),
    },
    assignmentId: '00000000-0000-0000-0000-000000000000',
  };
}

/** Yardımcı: token anahtarından CSS değişken adına (re-export). */
export { tokenKeyToCssVar };