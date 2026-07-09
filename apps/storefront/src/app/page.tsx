/**
 * Müşteri vitrini anasayfası — SEO optimized.
 *
 * - buildMetadata() ile Next.js Metadata (title, description, OG, Twitter)
 * - JsonLd ile Organization + WebSite schema (root layout'ta zaten var, ek WebPage eklenir)
 * - ItemList schema (popüler ürünler)
 * - BreadcrumbList (Anasayfa)
 */
import { Heading } from '@eticart/ui';
import { buildMetadata, JsonLd, breadcrumbSchema, itemListSchema } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Anasayfa',
  description:
    'EtiCart — Türkiye\'nin modern e-ticaret platformu. Binlerce ürün, uygun fiyat, hızlı kargo. KVKK uyumlu, güvenli alışveriş.',
  type: 'website',
  path: '/',
  tags: ['eticart', 'e-ticaret', 'online alışveriş'],
  alternates: {
    languages: {
      'tr-TR': '/',
      'en-US': '/en',
    },
  },
});

export default function HomePage() {
  // TODO: API'den popüler ürünler çekilecek
  const popularProducts = [
    { name: 'iPhone 15 Pro 256GB', url: '/urun/iphone-15-pro-256gb', image: 'https://cdn.eticart.com.tr/iphone-15.jpg', position: 1 },
    { name: 'Samsung Galaxy S24 Ultra', url: '/urun/samsung-galaxy-s24-ultra', position: 2 },
    { name: 'MacBook Air M3 13"', url: '/urun/macbook-air-m3-13', position: 3 },
  ];

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: 'Anasayfa', url: '/' }]),
          itemListSchema({
            name: 'Popüler Ürünler',
            url: '/',
            items: popularProducts,
          }),
        ]}
      />
      <main style={{ padding: '4rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
        <Heading level={1}>EtiCart Vitrini</Heading>
        <p>Modern, hızlı, güvenli e-ticaret deneyimi.</p>
      </main>
    </>
  );
}