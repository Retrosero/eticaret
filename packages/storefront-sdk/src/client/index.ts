/**
 * Storefront SDK — tip güvenli, tenant-bilinçli veri erişim katmanı.
 *
 * Özellikler:
 *  - Otomatik tenant context (host başlığından)
 *  - Server-side fetch (Next.js ile uyumlu)
 *  - Tag-based cache (revalidateTag ile uyumlu)
 *  - InMemoryStorefrontSdk — test ve önizleme için
 *
 * KRİTİK: Tema bileşenleri doğrudan DB sorgulamaz; yalnızca bu SDK üzerinden
 * tenant verisine erişir. Bu sayede:
 *  - Cross-tenant cache izolasyonu sağlanır
 *  - Mock veri ile önizleme mümkün olur
 *  - Backend değişiklikleri tema tarafında tek noktada yönetilir
 */

import type {
  StorefrontBanner,
  StorefrontBlogPost,
  StorefrontBrand,
  StorefrontCategory,
  StorefrontList,
  StorefrontListOptions,
  StorefrontPagePayload,
  StorefrontProductDetail,
  StorefrontProductDetailOptions,
  StorefrontProductSummary,
  StorefrontTestimonial,
} from '../types/index.js';

/** SDK seçenekleri. */
export interface StorefrontSdkOptions {
  /** Tenant ID. */
  readonly tenantId: string;
  /** Tenant slug. */
  readonly tenantSlug: string;
  /** Birincil domain (canonical URL çözümlemesi için). */
  readonly primaryDomain: string | null;
  /** Commerce backend base URL (ör: "http://commerce-backend:9000"). */
  readonly backendUrl: string | null;
  /** Dil. */
  readonly locale: string;
  /** Para birimi. */
  readonly currency: 'TRY' | 'EUR' | 'USD';
  /** Cache tag override (varsayılan: tenant-bazlı). */
  readonly cacheTags?: ReadonlyArray<string>;
}

/** Storefront SDK sözleşmesi. */
export interface StorefrontSdk {
  /** Tenant bilgisi. */
  readonly options: StorefrontSdkOptions;

  /** Ürün listeleme. */
  listProducts(opts?: StorefrontListOptions): Promise<StorefrontList<StorefrontProductSummary>>;

  /** Öne çıkan ürünler. */
  featuredProducts(limit?: number): Promise<ReadonlyArray<StorefrontProductSummary>>;

  /** Yeni ürünler. */
  newProducts(limit?: number): Promise<ReadonlyArray<StorefrontProductSummary>>;

  /** Çok satanlar. */
  bestSellers(limit?: number): Promise<ReadonlyArray<StorefrontProductSummary>>;

  /** Ürün detay. */
  productDetail(opts: StorefrontProductDetailOptions): Promise<StorefrontProductDetail | null>;

  /** Kategori listesi (ağaç). */
  categories(): Promise<ReadonlyArray<StorefrontCategory>>;

  /** Kategori detay. */
  categoryBySlug(slug: string): Promise<StorefrontCategory | null>;

  /** Marka listesi. */
  brands(): Promise<ReadonlyArray<StorefrontBrand>>;

  /** Banner (hero/slider). */
  banners(placement: string): Promise<ReadonlyArray<StorefrontBanner>>;

  /** Blog yazıları. */
  blogPosts(limit?: number): Promise<ReadonlyArray<StorefrontBlogPost>>;

  /** Yorumlar. */
  testimonials(limit?: number): Promise<ReadonlyArray<StorefrontTestimonial>>;

  /** CMS sayfası (ana sayfa / içerik). */
  pageBySlug(slug: string): Promise<StorefrontPagePayload | null>;

  /** Sayfa slug → meta (sitemap için). */
  allPageSlugs(): Promise<ReadonlyArray<{ readonly slug: string; readonly type: string; readonly updatedAt: string }>>;
}

/**
 * HTTP-tabanlı SDK implementasyonu — Next.js Server Components ile uyumlu.
 *
 * Cache stratejisi:
 *  - `fetch`'in `next: { tags, revalidate }` seçenekleri kullanılır
 *  - Tag formatı: `tenant:<id>:product:<id>`, `tenant:<id>:category:<slug>` vs.
 *  - Cross-tenant izolasyon her tag'de tenant id içerdiği için sağlanır
 */
export class HttpStorefrontSdk implements StorefrontSdk {
  constructor(public readonly options: StorefrontSdkOptions) {}

  private get baseHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Locale': this.options.locale,
      'X-Currency': this.options.currency,
      // Server-to-server storefront çağrısı tenant domainini Host üzerinden
      // taşır. Commerce backend tenantı kendi resolver'ı ile doğrular;
      // client tarafından gönderilen tenant ID header'ına güvenilmez.
      ...(this.options.primaryDomain ? { Host: this.options.primaryDomain } : {}),
    };
  }

  private get defaultTags(): string[] {
    return [
      `tenant:${this.options.tenantId}`,
      ...(this.options.cacheTags ?? []),
    ];
  }

  private async request<T>(path: string, tags: string[] = []): Promise<T | null> {
    if (!this.options.backendUrl) {
      // Backend yoksa sessizce null döner — tema demo verisine düşer.
      return null;
    }
    try {
      const res = await fetch(`${this.options.backendUrl}${path}`, {
        headers: this.baseHeaders,
        next: {
          tags: [...this.defaultTags, ...tags],
          revalidate: 300,
        },
      } as RequestInit & { next: { tags: string[]; revalidate: number } });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  async listProducts(opts?: StorefrontListOptions): Promise<StorefrontList<StorefrontProductSummary>> {
    const params = new URLSearchParams();
    if (opts?.page) params.set('page', String(opts.page));
    if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
    if (opts?.sort) params.set('sort', opts.sort);
    if (opts?.categorySlug) params.set('category', opts.categorySlug);
    if (opts?.brandSlug) params.set('brand', opts.brandSlug);
    if (opts?.search) params.set('q', opts.search);
    if (opts?.inStockOnly) params.set('in_stock', '1');
    if (opts?.featured) params.set('featured', '1');
    if (opts?.bestSellers) params.set('bestseller', '1');
    if (opts?.newOnly) params.set('new', '1');

    const tags = [`tenant:${this.options.tenantId}:products`];
    if (opts?.categorySlug) tags.push(`tenant:${this.options.tenantId}:category:${opts.categorySlug}`);

    const result = await this.request<StorefrontList<StorefrontProductSummary>>(
      `/store/products?${params.toString()}`,
      tags,
    );
    return (
      result ?? {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      }
    );
  }

  async featuredProducts(limit = 8): Promise<ReadonlyArray<StorefrontProductSummary>> {
    const list = await this.listProducts({ featured: true, pageSize: limit });
    return list.items;
  }

  async newProducts(limit = 8): Promise<ReadonlyArray<StorefrontProductSummary>> {
    const list = await this.listProducts({ newOnly: true, sort: 'newest', pageSize: limit });
    return list.items;
  }

  async bestSellers(limit = 8): Promise<ReadonlyArray<StorefrontProductSummary>> {
    const list = await this.listProducts({ bestSellers: true, sort: 'popular', pageSize: limit });
    return list.items;
  }

  async productDetail(opts: StorefrontProductDetailOptions): Promise<StorefrontProductDetail | null> {
    const tags = [
      `tenant:${this.options.tenantId}:product:${opts.slug}`,
      `tenant:${this.options.tenantId}:products`,
    ];
    return this.request<StorefrontProductDetail>(
      `/store/products/${encodeURIComponent(opts.slug)}`,
      tags,
    );
  }

  async categories(): Promise<ReadonlyArray<StorefrontCategory>> {
    const result = await this.request<ReadonlyArray<StorefrontCategory>>(
      `/store/categories`,
      [`tenant:${this.options.tenantId}:categories`],
    );
    return result ?? [];
  }

  async categoryBySlug(slug: string): Promise<StorefrontCategory | null> {
    return this.request<StorefrontCategory>(
      `/store/categories/${encodeURIComponent(slug)}`,
      [`tenant:${this.options.tenantId}:category:${slug}`],
    );
  }

  async brands(): Promise<ReadonlyArray<StorefrontBrand>> {
    const result = await this.request<ReadonlyArray<StorefrontBrand>>(
      `/store/brands`,
      [`tenant:${this.options.tenantId}:brands`],
    );
    return result ?? [];
  }

  async banners(placement: string): Promise<ReadonlyArray<StorefrontBanner>> {
    const result = await this.request<ReadonlyArray<StorefrontBanner>>(
      `/store/banners?placement=${encodeURIComponent(placement)}`,
      [`tenant:${this.options.tenantId}:banners:${placement}`],
    );
    return result ?? [];
  }

  async blogPosts(limit = 6): Promise<ReadonlyArray<StorefrontBlogPost>> {
    const result = await this.request<ReadonlyArray<StorefrontBlogPost>>(
      `/store/blog/posts?limit=${limit}`,
      [`tenant:${this.options.tenantId}:blog`],
    );
    return result ?? [];
  }

  async testimonials(limit = 6): Promise<ReadonlyArray<StorefrontTestimonial>> {
    const result = await this.request<ReadonlyArray<StorefrontTestimonial>>(
      `/store/testimonials?limit=${limit}`,
      [`tenant:${this.options.tenantId}:testimonials`],
    );
    return result ?? [];
  }

  async pageBySlug(slug: string): Promise<StorefrontPagePayload | null> {
    return this.request<StorefrontPagePayload>(
      `/store/pages/${encodeURIComponent(slug)}`,
      [`tenant:${this.options.tenantId}:page:${slug}`],
    );
  }

  async allPageSlugs(): Promise<ReadonlyArray<{ slug: string; type: string; updatedAt: string }>> {
    const result = await this.request<ReadonlyArray<{ slug: string; type: string; updatedAt: string }>>(
      `/store/pages`,
      [`tenant:${this.options.tenantId}:pages`],
    );
    return result ?? [];
  }
}

/**
 * In-memory SDK — test, önizleme ve demo veri için.
 */
export class InMemoryStorefrontSdk implements StorefrontSdk {
  private readonly data: InMemoryStorefrontData;

  constructor(
    public readonly options: StorefrontSdkOptions,
    data: InMemoryStorefrontData,
  ) {
    this.data = data;
  }

  async listProducts(opts?: StorefrontListOptions): Promise<StorefrontList<StorefrontProductSummary>> {
    let items = [...this.data.products];
    if (opts?.categorySlug) {
      const categorySlug = opts.categorySlug;
      items = items.filter((p) => {
        // Demo veri: ürün detayında categorySlug bilgisi olabilir; burada basit slug eşleşmesi.
        const slug = (p as unknown as { categorySlug?: string }).categorySlug;
        return slug === categorySlug;
      });
    }
    if (opts?.featured) items = items.filter((p) => p.isFeatured);
    if (opts?.bestSellers) items = items.filter((p) => p.isBestSeller);
    if (opts?.newOnly) items = items.filter((p) => p.isNew);
    if (opts?.inStockOnly) items = items.filter((p) => p.inStock);
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      items = items.filter((p) => p.title.toLowerCase().includes(q));
    }

    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const sliced = items.slice(start, start + pageSize);

    return {
      items: sliced,
      total: items.length,
      page,
      pageSize,
      hasMore: start + sliced.length < items.length,
    };
  }

  async featuredProducts(limit = 8): Promise<ReadonlyArray<StorefrontProductSummary>> {
    return this.data.products.filter((p) => p.isFeatured).slice(0, limit);
  }

  async newProducts(limit = 8): Promise<ReadonlyArray<StorefrontProductSummary>> {
    return this.data.products.filter((p) => p.isNew).slice(0, limit);
  }

  async bestSellers(limit = 8): Promise<ReadonlyArray<StorefrontProductSummary>> {
    return this.data.products.filter((p) => p.isBestSeller).slice(0, limit);
  }

  async productDetail(opts: StorefrontProductDetailOptions): Promise<StorefrontProductDetail | null> {
    const summary = this.data.products.find((p) => p.slug === opts.slug);
    if (!summary) return null;
    const detail = this.data.productDetails?.[summary.id];
    return detail ?? null;
  }

  async categories(): Promise<ReadonlyArray<StorefrontCategory>> {
    return this.data.categories;
  }

  async categoryBySlug(slug: string): Promise<StorefrontCategory | null> {
    return this.data.categories.find((c) => c.slug === slug) ?? null;
  }

  async brands(): Promise<ReadonlyArray<StorefrontBrand>> {
    return this.data.brands;
  }

  async banners(placement: string): Promise<ReadonlyArray<StorefrontBanner>> {
    return (this.data.banners ?? []).filter((b) => (b as unknown as { placement?: string }).placement === placement || placement === 'hero');
  }

  async blogPosts(limit = 6): Promise<ReadonlyArray<StorefrontBlogPost>> {
    return (this.data.blogPosts ?? []).slice(0, limit);
  }

  async testimonials(limit = 6): Promise<ReadonlyArray<StorefrontTestimonial>> {
    return (this.data.testimonials ?? []).slice(0, limit);
  }

  async pageBySlug(slug: string): Promise<StorefrontPagePayload | null> {
    return this.data.pages?.[slug] ?? null;
  }

  async allPageSlugs(): Promise<ReadonlyArray<{ slug: string; type: string; updatedAt: string }>> {
    if (!this.data.pages) return [];
    return Object.values(this.data.pages).map((p) => ({
      slug: p.page.slug,
      type: p.page.type,
      updatedAt: p.page.updatedAt,
    }));
  }
}

/** In-memory veri kaynağı — demo ve önizleme için. */
export interface InMemoryStorefrontData {
  readonly products: ReadonlyArray<StorefrontProductSummary>;
  readonly productDetails?: Readonly<Record<string, StorefrontProductDetail>>;
  readonly categories: ReadonlyArray<StorefrontCategory>;
  readonly brands: ReadonlyArray<StorefrontBrand>;
  readonly banners?: ReadonlyArray<StorefrontBanner>;
  readonly blogPosts?: ReadonlyArray<StorefrontBlogPost>;
  readonly testimonials?: ReadonlyArray<StorefrontTestimonial>;
  readonly pages?: Readonly<Record<string, StorefrontPagePayload>>;
}

/** SDK oluşturucu yardımcısı. */
export function createStorefrontSdk(
  options: StorefrontSdkOptions,
  data?: InMemoryStorefrontData,
): StorefrontSdk {
  if (data) {
    return new InMemoryStorefrontSdk(options, data);
  }
  return new HttpStorefrontSdk(options);
}
