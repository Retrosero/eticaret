/**
 * Storefront SDK unit testleri.
 */

import { describe, it, expect } from 'vitest';
import {
  InMemoryStorefrontSdk,
  type InMemoryStorefrontData,
} from '../client/index.js';
import type {
  StorefrontProductSummary,
  StorefrontCategory,
  StorefrontBanner,
} from '../types/index.js';

const products: StorefrontProductSummary[] = [
  {
    id: 'p1',
    slug: 'elbise',
    title: 'Yazlık Elbise',
    shortDescription: 'Hafif, pamuklu',
    priceKurus: 49900,
    compareAtKurus: 59900,
    currency: 'TRY',
    mainImageUrl: 'https://cdn/x1.jpg',
    inStock: true,
    isNew: true,
    isFeatured: true,
    isBestSeller: false,
    rating: 4.5,
    reviewCount: 12,
    brandName: 'MarkaX',
  },
  {
    id: 'p2',
    slug: 'tisort',
    title: 'Pamuklu Tişört',
    shortDescription: 'Rahat kesim',
    priceKurus: 19900,
    compareAtKurus: null,
    currency: 'TRY',
    mainImageUrl: 'https://cdn/x2.jpg',
    inStock: true,
    isNew: false,
    isFeatured: false,
    isBestSeller: true,
    rating: 4.2,
    reviewCount: 88,
    brandName: 'MarkaY',
  },
  {
    id: 'p3',
    slug: 'out-of-stock',
    title: 'Stokta Yok',
    shortDescription: 'Tükenmiş',
    priceKurus: 9900,
    compareAtKurus: null,
    currency: 'TRY',
    mainImageUrl: null,
    inStock: false,
    isNew: false,
    isFeatured: false,
    isBestSeller: false,
    rating: null,
    reviewCount: 0,
    brandName: null,
  },
];

const categories: StorefrontCategory[] = [
  {
    id: 'c1',
    slug: 'kadin',
    name: 'Kadın',
    description: 'Kadın giyim',
    imageUrl: null,
    productCount: 2,
    children: [
      { id: 'c1-1', slug: 'elbiseler', name: 'Elbiseler', description: null, imageUrl: null, productCount: 1, children: [] },
    ],
  },
];

const banners: StorefrontBanner[] = [
  {
    id: 'b1',
    title: 'Yaz Koleksiyonu',
    subtitle: '%50 İndirim',
    imageUrl: 'https://cdn/banner1.jpg',
    imageMobileUrl: null,
    ctaLabel: 'Keşfet',
    ctaHref: '/koleksiyon/yaz',
    order: 1,
  },
];

const data: InMemoryStorefrontData = {
  products,
  categories,
  brands: [],
  banners,
};

const sdk = new InMemoryStorefrontSdk(
  {
    tenantId: 't1',
    tenantSlug: 'demo',
    primaryDomain: 'demo.example.com',
    backendUrl: null,
    locale: 'tr',
    currency: 'TRY',
  },
  data,
);

describe('storefront-sdk / InMemoryStorefrontSdk', () => {
  it('tüm ürünleri listeler', async () => {
    const list = await sdk.listProducts();
    expect(list.total).toBe(3);
    expect(list.items.length).toBe(3);
  });

  it('öne çıkan filtre çalışır', async () => {
    const list = await sdk.listProducts({ featured: true });
    expect(list.items.length).toBe(1);
    expect(list.items[0]?.slug).toBe('elbise');
  });

  it('çok satanlar filtre çalışır', async () => {
    const list = await sdk.bestSellers();
    expect(list.length).toBe(1);
    expect(list[0]?.slug).toBe('tisort');
  });

  it('yeni ürünler filtre çalışır', async () => {
    const list = await sdk.newProducts();
    expect(list.length).toBe(1);
    expect(list[0]?.slug).toBe('elbise');
  });

  it('stok filtresi çalışır', async () => {
    const list = await sdk.listProducts({ inStockOnly: true });
    expect(list.items.length).toBe(2);
  });

  it('sayfalama çalışır', async () => {
    const list = await sdk.listProducts({ page: 1, pageSize: 2 });
    expect(list.items.length).toBe(2);
    expect(list.hasMore).toBe(true);
  });

  it('arama çalışır', async () => {
    const list = await sdk.listProducts({ search: 'elbise' });
    expect(list.items.length).toBe(1);
  });

  it('kategori listesi döner', async () => {
    const cats = await sdk.categories();
    expect(cats.length).toBe(1);
    expect(cats[0]?.children.length).toBe(1);
  });

  it('banner döner', async () => {
    const banners = await sdk.banners('hero');
    expect(banners.length).toBe(1);
  });

  it('olmayan ürün null döner', async () => {
    const detail = await sdk.productDetail({ slug: 'yok' });
    expect(detail).toBeNull();
  });

  it('mevcut ürün detay null döner (InMemoryStorefrontData.productDetails yok)', async () => {
    const detail = await sdk.productDetail({ slug: 'elbise' });
    expect(detail).toBeNull();
  });
});