/**
 * @eticart/storefront-sdk — veri tipleri.
 *
 * Bu tipler `apps/commerce-backend` tarafından doldurulan endpoint'lerin
 * yanıt formatını yansıtır. Tema bileşenleri yalnızca bu tipleri kullanır;
 * ham HTTP / DB sorgusu yapmaz.
 */

import type { Uuid, IsoDateString } from '@eticart/shared-types';

/** Ürün özet (listeleme, grid). */
export interface StorefrontProductSummary {
  readonly id: Uuid;
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly priceKurus: number;
  readonly compareAtKurus: number | null;
  readonly currency: 'TRY' | 'EUR' | 'USD';
  readonly mainImageUrl: string | null;
  readonly inStock: boolean;
  readonly isNew: boolean;
  readonly isFeatured: boolean;
  readonly isBestSeller: boolean;
  readonly rating: number | null;
  readonly reviewCount: number;
  readonly brandName: string | null;
}

/** Ürün detay (ürün sayfası). */
export interface StorefrontProductDetail extends StorefrontProductSummary {
  readonly description: string;
  readonly images: ReadonlyArray<{
    readonly id: string;
    readonly url: string;
    readonly alt: string;
    readonly order: number;
  }>;
  readonly variants: ReadonlyArray<{
    readonly id: Uuid;
    readonly sku: string;
    readonly name: string;
    readonly priceKurus: number;
    readonly stockQty: number;
    readonly attributes: Readonly<Record<string, string>>;
    readonly imageUrl: string | null;
  }>;
  readonly attributes: ReadonlyArray<{
    readonly name: string;
    readonly value: string;
  }>;
  readonly categories: ReadonlyArray<StorefrontCategory>;
  readonly brand: { readonly id: Uuid; readonly name: string; readonly logoUrl: string | null } | null;
  readonly seo: {
    readonly title: string | null;
    readonly description: string | null;
    readonly ogImageUrl: string | null;
  };
  readonly updatedAt: IsoDateString;
}

/** Kategori özet. */
export interface StorefrontCategory {
  readonly id: Uuid;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly productCount: number;
  readonly children: ReadonlyArray<StorefrontCategory>;
}

/** Sayfalanmış liste. */
export interface StorefrontList<T> {
  readonly items: ReadonlyArray<T>;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

/** Sayfa sorgu seçenekleri. */
export interface StorefrontListOptions {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: 'newest' | 'oldest' | 'price-asc' | 'price-desc' | 'popular' | 'rating';
  readonly categorySlug?: string;
  readonly brandSlug?: string;
  readonly search?: string;
  readonly inStockOnly?: boolean;
  readonly featured?: boolean;
  readonly bestSellers?: boolean;
  readonly newOnly?: boolean;
}

/** Marka özet. */
export interface StorefrontBrand {
  readonly id: Uuid;
  readonly slug: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly productCount: number;
}

/** Banner (hero / slider için). */
export interface StorefrontBanner {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly imageUrl: string;
  readonly imageMobileUrl: string | null;
  readonly ctaLabel: string | null;
  readonly ctaHref: string | null;
  readonly order: number;
}

/** Blog yazısı özet. */
export interface StorefrontBlogPost {
  readonly id: Uuid;
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly imageUrl: string | null;
  readonly publishedAt: IsoDateString;
  readonly readingTimeMin: number;
}

/** Müşteri yorumu. */
export interface StorefrontTestimonial {
  readonly id: string;
  readonly customerName: string;
  readonly customerTitle: string | null;
  readonly rating: number;
  readonly comment: string;
  readonly avatarUrl: string | null;
  readonly approvedAt: IsoDateString;
}

/** Sayfa listeleme (CMS). */
export interface StorefrontPage {
  readonly id: Uuid;
  readonly slug: string;
  readonly title: string;
  readonly type: 'home' | 'category' | 'product' | 'cart' | 'checkout' | 'content' | 'custom';
  readonly status: 'draft' | 'published' | 'archived';
  readonly updatedAt: IsoDateString;
}

/** Sayfa blok (CMS render girişi). */
export interface StorefrontPageBlock {
  readonly id: string;
  readonly type: string;
  readonly order: number;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly visibility: { readonly desktop: boolean; readonly mobile: boolean };
}

/** Sayfa render payload (CMS). */
export interface StorefrontPagePayload {
  readonly page: StorefrontPage;
  readonly blocks: ReadonlyArray<StorefrontPageBlock>;
  readonly seo: {
    readonly title: string;
    readonly description: string;
    readonly ogImageUrl: string | null;
    readonly canonicalUrl: string | null;
    readonly robots: string;
  };
  readonly breadcrumbs: ReadonlyArray<{ readonly label: string; readonly href: string }>;
}

/** Ürün sorgu seçenekleri (detay). */
export interface StorefrontProductDetailOptions {
  readonly slug: string;
}