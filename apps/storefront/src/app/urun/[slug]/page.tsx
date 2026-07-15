/** Gerçek tenant SDK'sı üzerinden ürün detay sayfası. */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { buildMetadata, JsonLd } from '@/lib/seo';
import { productSchema, breadcrumbSchema } from '@/lib/seo';
import { resolveStorefrontTenant } from '@/lib/theme/tenant-resolver';
import { loadTheme } from '../../../../lib/theme/loader';
import { demoData } from '../../../../lib/theme/demo-data';
import TenantLayout from '../../[...slug]/layout';
import { getThemeDefinition, themeClass } from '../../../../lib/theme/dispatcher';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

async function loadProduct(slug: string) {
  const host = (await headers()).get('host') ?? 'demo.eticart.local';
  const ctx = await resolveStorefrontTenant(host);
  if (!ctx) return null;

  const { sdk, theme } = await loadTheme({
    ctx,
    demoData: process.env['NODE_ENV'] === 'development' ? demoData : undefined,
    backendUrl: process.env['NEXT_PUBLIC_STORE_API'],
  });
  const product = await sdk.productDetail({ slug });
  return product ? { ctx, product, theme } : null;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadProduct(slug);
  if (!result) return { title: 'Ürün bulunamadı' };

  const { product } = result;
  return buildMetadata({
    title: product.seo.title ?? product.title,
    description: product.seo.description ?? product.shortDescription,
    type: 'product',
    path: `/urun/${product.slug}`,
    ogImage: product.seo.ogImageUrl ?? product.mainImageUrl ?? undefined,
    tags: [product.brand?.name, ...product.categories.map((category) => category.name)].filter(
      (value): value is string => Boolean(value),
    ),
  });
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const result = await loadProduct(slug);
  if (!result) notFound();

  const { ctx, product, theme } = result;
  const productUrl = `/urun/${product.slug}`;
  const category = product.categories[0];
  const imageUrls = product.images.map((image) => image.url);
  const ThemeProductGallery = getThemeDefinition(theme.manifest.id).productGallery;
  const price = product.priceKurus / 100;

  return (
    <TenantLayout>
      <JsonLd
        id="product-page"
        data={[
          productSchema({
            id: product.id,
            name: product.title,
            description: product.description,
            image: imageUrls,
            sku: product.variants[0]?.sku ?? product.slug,
            brandName: product.brand?.name ?? 'Markasız',
            category: category?.name,
            url: productUrl,
            price,
            currency: product.currency,
            availability: product.inStock ? 'in_stock' : 'out_of_stock',
            condition: 'new',
            priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            ratingValue: product.rating ?? undefined,
            reviewCount: product.reviewCount,
          }),
          breadcrumbSchema([
            { name: 'Anasayfa', url: '/' },
            ...(category ? [{ name: category.name, url: `/kategori/${category.slug}` }] : []),
            { name: product.title, url: productUrl },
          ]),
        ]}
      />

      <main className="theme-container" style={{ paddingTop: 32, paddingBottom: 64 }}>
        <nav aria-label="breadcrumb" className="theme-breadcrumb">
          <a href="/">Anasayfa</a>
          {category && <><span> › </span><a href={`/kategori/${category.slug}`}>{category.name}</a></>}
          <span> › </span><span>{product.title}</span>
        </nav>

        <div className="theme-product-detail" style={{ display: 'grid', gap: 32, gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', marginTop: 24 }}>
          <ThemeProductGallery product={product} themeClass={themeClass(theme.manifest.id)} />
          <section>
            {product.brand && <p className="theme-muted">{product.brand.name}</p>}
            <h1>{product.title}</h1>
            <p>{product.description}</p>
            <strong>{new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: product.currency }).format(price)}</strong>
            {!product.inStock && <p className="theme-muted">Stokta yok</p>}
            {product.variants.length > 0 && (
              <ul aria-label="Ürün seçenekleri">
                {product.variants.map((variant) => <li key={variant.id}>{variant.name} — {variant.stockQty > 0 ? 'Stokta' : 'Tükendi'}</li>)}
              </ul>
            )}
          </section>
        </div>
      </main>
    </TenantLayout>
  );
}
