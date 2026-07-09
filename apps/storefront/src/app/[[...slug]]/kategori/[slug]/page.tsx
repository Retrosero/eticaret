/**
 * Kategori sayfası — sidebar/top filtre varyantı + ürün grid.
 *
 * Varyant seçimi `theme.tokens['variant.category-page']` üzerinden yapılır.
 */

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { resolveStorefrontTenant } from '../../../../lib/theme/tenant-resolver.js';
import { loadTheme } from '../../../../../lib/theme/loader.js';
import { demoData } from '../../../../../lib/theme/demo-data.js';
import { ProductCard, formatMoney } from '../../../../../lib/theme/registry.js';
import { themeClass } from '../../../../../lib/theme/dispatcher.js';
import type { StorefrontCategory, StorefrontProductSummary } from '@eticart/storefront-sdk';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const headerStore = await headers();
  const host = headerStore.get('host') ?? 'demo.eticart.local';
  const ctx = await resolveStorefrontTenant(host);
  if (!ctx) return { title: 'Kategori' };
  const { sdk, theme } = await loadTheme({ ctx, demoData });
  const category = await sdk.categoryBySlug(slug);
  if (!category) return { title: 'Kategori bulunamadı' };
  return {
    title: category.name,
    description: category.description ?? `${category.name} kategorisindeki ürünler`,
    alternates: {
      canonical: `/kategori/${slug}`,
    },
    openGraph: {
      title: category.name,
      description: category.description ?? undefined,
      images: category.imageUrl ? [category.imageUrl] : [],
      type: 'website',
    },
  };
}

function flattenCategories(categories: ReadonlyArray<StorefrontCategory>): StorefrontCategory[] {
  const out: StorefrontCategory[] = [];
  for (const c of categories) {
    out.push(c);
    for (const child of c.children) out.push(child);
  }
  return out;
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const headerStore = await headers();
  const host = headerStore.get('host') ?? 'demo.eticart.local';
  const ctx = await resolveStorefrontTenant(host);
  if (!ctx) notFound();
  const { sdk, theme } = await loadTheme({ ctx, demoData });
  const category = await sdk.categoryBySlug(slug);
  if (!category) notFound();
  const allCategories = await sdk.categories();
  const flatCategories = flattenCategories(allCategories);
  const list = await sdk.listProducts({ categorySlug: slug, pageSize: 24 });
  const cls = themeClass(theme.manifest.id);
  const variant = (theme.tokens['variant.category-page'] as string) ?? 'top-filter';
  const cardVariant = (theme.tokens['variant.product-card'] as string) ?? 'vertical';

  return (
    <div className="theme-container">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="theme-breadcrumb" style={{ padding: '16px 0', fontSize: 13 }}>
        <Link href="/">Anasayfa</Link>
        <span className="theme-muted"> › </span>
        <Link href="/kategori">{category.name}</Link>
        <span className="theme-muted"> › </span>
        <span>{category.name}</span>
      </nav>

      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, margin: 0 }}>{category.name}</h1>
        {category.description && <p className="theme-muted">{category.description}</p>}
        <p className="theme-muted" style={{ fontSize: 13 }}>{list.total} ürün</p>
      </header>

      <div className={`${cls}-category-page theme-category-page theme-category-page--${variant}`}>
        {variant === 'sidebar-filter' && (
          <aside className="theme-category-page__sidebar" aria-label="Filtre">
            <div className="theme-category-page__filter-group">
              <h3>Kategoriler</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {flatCategories.map((c) => (
                  <li key={c.id} style={{ marginBottom: 8 }}>
                    <Link href={`/kategori/${c.slug}`}>{c.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="theme-category-page__filter-group">
              <h3>Markalar</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {(await sdk.brands()).map((b) => (
                  <li key={b.id} style={{ marginBottom: 8 }}>
                    <Link href={`/marka/${b.slug}`}>{b.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}

        <div className="theme-category-page__main">
          {variant === 'top-filter' && (
            <div className="theme-category-page__top-filter">
              <span className="theme-muted">Sırala:</span>
              <select aria-label="Sıralama" className="theme-select">
                <option value="newest">En Yeni</option>
                <option value="price-asc">Fiyat: Düşükten Yükseğe</option>
                <option value="price-desc">Fiyat: Yüksekten Düşüğe</option>
                <option value="popular">Popüler</option>
              </select>
            </div>
          )}

          {list.items.length === 0 ? (
            <div className="theme-empty">
              <p>Bu kategoride henüz ürün yok.</p>
            </div>
          ) : (
            <div className={`theme-grid ${variant === 'sidebar-filter' ? 'theme-grid--cols-3' : 'theme-grid--cols-4'}`}>
              {list.items.map((p: StorefrontProductSummary) => (
                <ProductCard key={p.id} product={p} variant={cardVariant as 'horizontal' | 'vertical' | 'compact'} themeClass={cls} />
              ))}
            </div>
          )}

          {list.hasMore && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <button className="theme-btn theme-btn-secondary">Daha Fazla Yükle</button>
            </div>
          )}
        </div>
      </div>

      {/* JSON-LD: CollectionPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: category.name,
            description: category.description,
            url: `https://${ctx.primaryDomain}/kategori/${slug}`,
            numberOfItems: list.total,
          }),
        }}
      />
    </div>
  );
}