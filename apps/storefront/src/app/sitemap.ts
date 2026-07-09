/**
 * Next.js App Router sitemap endpoint.
 *
 * /sitemap.xml → tüm URL'ler (statik + dinamik)
 * /sitemap/products.xml → sadece ürünler
 * /sitemap/categories.xml → sadece kategoriler
 */
import type { MetadataRoute } from 'next';
import { buildSitemap, buildProductsSitemap, buildCategoriesSitemap } from '@/lib/seo';

export const revalidate = 3600; // 1 saat

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Statik + dinamik sayfalar
  // Tenant subdomain başına farklı sitemap üretilebilir (ileride)
  const dynamicPages = async () => {
    // TODO: API'den çekilecek
    // const api = await fetch(`${process.env.BACKEND_URL}/api/store/products?limit=500`);
    // const { items } = await api.json();
    // return items.map((p) => ({
    //   path: `/urun/${p.slug}`,
    //   changeFrequency: 'weekly' as const,
    //   priority: 0.8,
    // }));
    return [];
  };

  return buildSitemap({ dynamicPages });
}