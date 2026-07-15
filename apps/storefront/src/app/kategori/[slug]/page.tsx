import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { resolveStorefrontTenant } from '@/lib/theme/tenant-resolver';
import { loadTheme } from '../../../../lib/theme/loader';
import { demoData } from '../../../../lib/theme/demo-data';
import { getThemeDefinition, themeClass } from '../../../../lib/theme/dispatcher';
import TenantLayout from '../../[...slug]/layout';

interface PageProps { params: Promise<{ slug: string }> }

async function resolveCategoryPage(slug: string) {
  const host = (await headers()).get('host') ?? 'demo.eticart.local';
  const ctx = await resolveStorefrontTenant(host);
  if (!ctx) return null;
  const { sdk, theme } = await loadTheme({
    ctx,
    demoData: process.env['NODE_ENV'] === 'development' ? demoData : undefined,
    backendUrl: process.env['NEXT_PUBLIC_STORE_API'],
  });
  const category = await sdk.categoryBySlug(slug);
  if (!category) return null;
  const [categories, brands, list] = await Promise.all([
    sdk.categories(),
    sdk.brands(),
    sdk.listProducts({ categorySlug: slug, pageSize: 24 }),
  ]);
  return { ctx, theme, category, categories, brands, list };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const result = await resolveCategoryPage((await params).slug);
  if (!result) return { title: 'Kategori bulunamadı' };
  return {
    title: result.category.name,
    description: result.category.description ?? `${result.category.name} kategorisindeki ürünler`,
    alternates: { canonical: `/kategori/${result.category.slug}` },
    openGraph: {
      title: result.category.name,
      description: result.category.description ?? undefined,
      images: result.category.imageUrl ? [result.category.imageUrl] : [],
      type: 'website',
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const result = await resolveCategoryPage((await params).slug);
  if (!result) notFound();

  const { ctx, theme, category, categories, brands, list } = result;
  const definition = getThemeDefinition(theme.manifest.id);
  const ThemeProductCard = definition.productCard;
  const ThemeCategoryLayout = definition.categoryLayout;
  const cls = themeClass(theme.manifest.id);
  const variant = ((theme.tokens['variant.category-page'] as string) ?? 'top-filter') as 'sidebar-filter' | 'top-filter';
  const cardVariant = ((theme.tokens['variant.product-card'] as string) ?? 'vertical') as 'horizontal' | 'vertical' | 'compact';

  return (
    <TenantLayout>
      <div className="theme-container">
        <nav aria-label="breadcrumb" className="theme-breadcrumb" style={{ padding: '16px 0', fontSize: 13 }}>
          <Link href="/">Anasayfa</Link><span className="theme-muted"> › </span>
          <span>{category.name}</span>
        </nav>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, margin: 0 }}>{category.name}</h1>
          {category.description && <p className="theme-muted">{category.description}</p>}
          <p className="theme-muted" style={{ fontSize: 13 }}>{list.total} ürün</p>
        </header>

        <ThemeCategoryLayout variant={variant} themeClass={cls} categories={categories} brands={brands}>
          {list.items.length === 0 ? (
            <div className="theme-empty"><p>Bu kategoride henüz ürün yok.</p></div>
          ) : (
            <div className={`theme-grid ${variant === 'sidebar-filter' ? 'theme-grid--cols-3' : 'theme-grid--cols-4'}`}>
              {list.items.map((product) => <ThemeProductCard key={product.id} product={product} variant={cardVariant} themeClass={cls} />)}
            </div>
          )}
          {list.hasMore && <div style={{ textAlign: 'center', padding: '24px 0' }}><button className="theme-btn theme-btn-secondary">Daha Fazla Yükle</button></div>}
        </ThemeCategoryLayout>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org', '@type': 'CollectionPage', name: category.name,
          description: category.description, url: `https://${ctx.primaryDomain}/kategori/${category.slug}`, numberOfItems: list.total,
        }) }} />
      </div>
    </TenantLayout>
  );
}
