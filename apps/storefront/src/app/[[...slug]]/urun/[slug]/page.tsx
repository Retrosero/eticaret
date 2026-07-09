/**
 * Ürün detay sayfası — SEO optimized.
 *
 * - buildMetadata() ile Product sayfa meta
 * - JsonLd: Product (Offer + AggregateRating), BreadcrumbList, FAQPage (varsa)
 * - generateMetadata() — dinamik meta (server-side)
 */
import { notFound } from 'next/navigation';
import { buildMetadata, JsonLd } from '@/lib/seo';
import { productSchema, breadcrumbSchema } from '@/lib/seo';
import type { Metadata } from 'next';

interface ProductPageProps {
  params: { slug: string };
}

// TODO: API'den çekilecek
async function fetchProduct(slug: string) {
  // const api = await fetch(`${process.env.BACKEND_URL}/api/store/products/${slug}`, {
  //   next: { revalidate: 300 }, // 5 dakika cache
  // });
  // if (!api.ok) return null;
  // return api.json();
  return {
    id: 'p1',
    slug,
    name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: `${slug.replace(/-/g, ' ')} — yüksek kaliteli, hızlı kargo, güvenli ödeme. EtiCart güvencesiyle.`,
    sku: `SKU-${slug.toUpperCase()}`,
    gtin: '8691234567890',
    brandName: 'Generic Brand',
    category: 'Elektronik',
    images: [
      'https://cdn.eticart.com.tr/products/abc/1.jpg',
      'https://cdn.eticart.com.tr/products/abc/2.jpg',
    ],
    price: 1250.00,
    currency: 'TRY',
    availability: 'in_stock' as const,
    condition: 'new' as const,
    rating: 4.5,
    reviewCount: 128,
    stock: 50,
  };
}

/**
 * Dinamik meta — generateMetadata().
 *
 * Next.js, route'da bu fonksiyon varsa build sırasında her slug için ayrı meta üretir.
 */
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const product = await fetchProduct(params.slug);
  if (!product) return {};

  return buildMetadata({
    title: product.name,
    description: product.description,
    type: 'product',
    path: `/urun/${params.slug}`,
    ogImage: product.images[0],
    tags: [product.brandName, product.category, 'eticart'],
    alternates: {
      languages: {
        'tr-TR': `/urun/${params.slug}`,
        'en-US': `/en/product/${params.slug}`,
      },
    },
  });
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await fetchProduct(params.slug);
  if (!product) notFound();

  const productUrl = `/urun/${params.slug}`;

  return (
    <>
      {/* Schema.org JSON-LD */}
      <JsonLd
        id="product-page"
        data={[
          productSchema({
            id: product.id,
            name: product.name,
            description: product.description,
            image: product.images,
            sku: product.sku,
            gtin: product.gtin,
            brandName: product.brandName,
            category: product.category,
            url: productUrl,
            price: product.price,
            currency: product.currency,
            availability: product.availability,
            condition: product.condition,
            priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          }),
          breadcrumbSchema([
            { name: 'Anasayfa', url: '/' },
            { name: 'Ürünler', url: '/urunler' },
            { name: product.category, url: `/kategori/${product.category.toLowerCase()}` },
            { name: product.name, url: productUrl },
          ]),
        ]}
      />

      <main style={{ padding: '4rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>{product.name}</h1>
        <p>{product.description}</p>
        <p>
          <strong>{product.price.toFixed(2)} {product.currency}</strong>
        </p>
      </main>
    </>
  );
}