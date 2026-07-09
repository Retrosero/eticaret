/**
 * @eticart/theme-engine — ortak tip tanımları.
 *
 * Tüm tema, blok, design token ve sayfa tiplerinin tek kaynağı.
 * Hem server (resolver) hem de client (bileşen) tarafında tüketilir.
 */

import type { Uuid, IsoDateString } from '@eticart/shared-types';

/** Hex formatında renk. */
export type HexColor = `#${string}`;

/** Tasarım token kategorileri. */
export type TokenCategory =
  | 'color'
  | 'font'
  | 'spacing'
  | 'radius'
  | 'shadow'
  | 'breakpoint'
  | 'motion';

/** Tek bir tasarım token'ı. */
export interface DesignToken {
  /** CSS değişken adı (örn. "color-primary"). */
  readonly name: string;
  /** Kategori (renk, font, vs.). */
  readonly category: TokenCategory;
  /** Tip (string, number, color). */
  readonly type: 'string' | 'number' | 'color';
  /** Varsayılan değer. */
  readonly defaultValue: string | number;
  /** Açıklama (UI ipucu olarak kullanılır). */
  readonly description?: string;
}

/** Bir temanın tüm design token değerleri (key → değer). */
export type DesignTokenValues = Readonly<Record<string, string | number>>;

/** Tasarım token şeması (manifest içinde taşınır). */
export interface DesignTokenSchema {
  readonly tokens: ReadonlyArray<DesignToken>;
}

/** Temanın desteklediği varyantları. */
export interface ThemeVariants {
  readonly header: ReadonlyArray<'classic' | 'mega-menu' | 'transparent'>;
  readonly footer: ReadonlyArray<'two-column' | 'three-column' | 'four-column'>;
  readonly productCard: ReadonlyArray<'horizontal' | 'vertical' | 'compact'>;
  readonly categoryPage: ReadonlyArray<'sidebar-filter' | 'top-filter'>;
  readonly productDetailGallery: ReadonlyArray<'classic' | 'zoom' | 'carousel'>;
}

/** Temanın desteklediği blok tiplerinin listesi. */
export type ThemeBlockType =
  | 'hero'
  | 'slider'
  | 'banner-grid'
  | 'featured-products'
  | 'new-products'
  | 'best-sellers'
  | 'category-showcase'
  | 'brand-showcase'
  | 'countdown'
  | 'text-image'
  | 'video-embed'
  | 'testimonials'
  | 'blog-list'
  | 'newsletter'
  | 'faq'
  | 'html';

/** Tema manifest'inin tamamı. */
export interface ThemeManifest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  /** Semver (örn. "1.4.2"). */
  readonly version: string;
  /** Temanın ekran görüntüleri (URL listesi). */
  readonly screenshots: ReadonlyArray<string>;
  /** Tasarım token değerleri (varsayılan). */
  readonly tokens: DesignTokenValues;
  /** Desteklenen layout şemaları. */
  readonly layouts: ReadonlyArray<string>;
  /** Bu temada kullanılabilen bloklar. */
  readonly blocks: ReadonlyArray<ThemeBlockType>;
  /** Varyant seti. */
  readonly variants: ThemeVariants;
  /** Minimum Faz 5 uyumluluğu. */
  readonly minPlatformVersion: string;
}

/** Tenant bazında tema ataması (DB kaydı). */
export interface TenantThemeAssignment {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly themeId: string;
  readonly version: string;
  readonly status: 'draft' | 'active' | 'archived';
  /** Tenant override değerleri (design token üzerine yazma). */
  readonly overrides: DesignTokenValues;
  /** Tenant override edilen logo URL. */
  readonly logoUrl: string | null;
  /** Favicon URL. */
  readonly faviconUrl: string | null;
  readonly activatedAt: IsoDateString | null;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}

/** Header / footer menü kaydı. */
export interface NavigationMenu {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly type: 'header' | 'footer';
  readonly status: 'draft' | 'published';
  readonly items: ReadonlyArray<NavigationMenuItem>;
  readonly updatedAt: IsoDateString;
}

/** Menü öğesi. */
export interface NavigationMenuItem {
  readonly id: string;
  readonly label: string;
  /** URL veya `/sayfa-slug` şeklinde path. */
  readonly href: string;
  /** Harici bağlantı mı? */
  readonly external: boolean;
  /** Alt menü öğeleri (sınırsız). */
  readonly children: ReadonlyArray<NavigationMenuItem>;
}

/** Sayfa kaydı. */
export interface PageRecord {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly slug: string;
  readonly title: string;
  readonly type: PageType;
  readonly status: 'draft' | 'published' | 'archived';
  readonly currentRevisionId: Uuid;
  readonly updatedAt: IsoDateString;
}

/** Sayfa tipleri. */
export type PageType =
  | 'home'
  | 'category'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'content'
  | 'custom';

/** Sayfa revizyonu. */
export interface PageRevision {
  readonly id: Uuid;
  readonly pageId: Uuid;
  readonly version: number;
  readonly blocks: ReadonlyArray<PageBlockRecord>;
  readonly authorId: Uuid;
  readonly createdAt: IsoDateString;
  readonly note: string | null;
}

/** Sayfadaki tek bir blok. */
export interface PageBlockRecord {
  readonly id: string;
  readonly type: ThemeBlockType;
  /** Sıralama (0'dan başlar). */
  readonly order: number;
  /** Blok tipine özel ayarlar (JSON). */
  readonly settings: Readonly<Record<string, unknown>>;
  /** Görünürlük. */
  readonly visibility: {
    readonly desktop: boolean;
    readonly mobile: boolean;
  };
}

/** SEO ayarı. */
export interface SEOSetting {
  readonly tenantId: Uuid;
  readonly titleTemplate: string;
  readonly defaultTitle: string;
  readonly defaultDescription: string;
  readonly defaultOgImage: string | null;
  readonly robots: string;
  readonly sitemapEnabled: boolean;
  readonly canonicalBase: string | null;
  /** Ölçüm/pixel scriptleri (sadece admin tarafından). */
  readonly scripts: ReadonlyArray<ScriptIntegration>;
  readonly updatedAt: IsoDateString;
}

/** Ölçüm / pixel script entegrasyonu. */
export interface ScriptIntegration {
  readonly id: string;
  /** 'head' veya 'body'. */
  readonly position: 'head' | 'body';
  /** 'analytics', 'pixel', 'chat', 'custom'. */
  readonly kind: 'analytics' | 'pixel' | 'chat' | 'custom';
  /** Script içeriği (admin tarafından girilmiş, sanitizasyon zorunlu). */
  readonly content: string;
  /** Yalnızca admin rolü ekleyebilir. */
  readonly adminOnly: true;
}

/** URL yönlendirme kuralı. */
export interface RedirectRule {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly from: string;
  readonly to: string;
  readonly statusCode: 301 | 302 | 307 | 308;
  readonly enabled: boolean;
}

/** Tema motoru tarafından çözümlenen, render'a hazır bağlam. */
export interface ResolvedTheme {
  readonly manifest: ThemeManifest;
  /** Aktif token değerleri (override sonrası). */
  readonly tokens: DesignTokenValues;
  /** Aktif varyant seçimleri (tema override edilebilir). */
  readonly variants: ThemeVariants;
  /** Aktif header menüsü (yoksa boş liste). */
  readonly headerMenu: NavigationMenu;
  /** Aktif footer menüsü. */
  readonly footerMenu: NavigationMenu;
  /** Aktif logo URL. */
  readonly logoUrl: string | null;
  readonly faviconUrl: string | null;
  /** Aktif SEO ayarı. */
  readonly seo: SEOSetting;
  /** Aktif atama kimliği. */
  readonly assignmentId: Uuid;
}