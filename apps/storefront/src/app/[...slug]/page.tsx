/**
 * Anasayfa — CMS tabanlı blok render.
 *
 * Server Component: Storefront SDK üzerinden sayfa bloklarını çeker ve sırayla
 * render eder. Veri yoksa fallback blok kümesi kullanılır (ürün grid + hero).
 */

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { Fragment } from 'react';
import { renderStorefrontBlock, supportedBlocksForTheme } from '../../../lib/theme/block-registry';
import { resolveStorefrontTenant } from '@/lib/theme/tenant-resolver';
import { loadTheme } from '../../../lib/theme/loader';
import { demoData } from '../../../lib/theme/demo-data';
import { themeClass } from '../../../lib/theme/dispatcher';
import type { PageBlockRecord } from '@eticart/theme-engine';
import type { StorefrontSdk } from '@eticart/storefront-sdk';

/**
 * Cache'lenmiş blok listesi — Next.js tag-based cache kullanır.
 * Ürün güncellenince ilgili tag'lar revalidateTag ile invalidate edilir.
 */
const getDemoHomePageBlocks = unstable_cache(
  async (): Promise<PageBlockRecord[]> => {
    // Faz 5'te: SDK.pageBySlug('home') → StorefrontPagePayload
    // Demo modunda: hardcoded fallback bloklar
    return [
      {
        id: 'b-hero',
        type: 'hero',
        order: 0,
        settings: {
          title: 'Modern Türkçe E-Ticaret Deneyimi',
          subtitle: 'En yeni koleksiyonlar, en uygun fiyatlar, hızlı kargo.',
          ctaLabel: 'Koleksiyonu Keşfet',
          ctaHref: '/koleksiyon/yeni',
          imageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600',
          align: 'left',
        },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-slider',
        type: 'slider',
        order: 1,
        settings: { placement: 'home-slider' },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-categories',
        type: 'category-showcase',
        order: 2,
        settings: { title: 'Kategoriler', limit: 6 },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-featured',
        type: 'featured-products',
        order: 3,
        settings: { title: 'Öne Çıkan Ürünler', limit: 4, cardVariant: 'horizontal' },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-banner-grid',
        type: 'banner-grid',
        order: 4,
        settings: { placement: 'home-banner-grid', columns: 3 },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-new',
        type: 'new-products',
        order: 5,
        settings: { title: 'Yeni Gelenler', limit: 4 },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-countdown',
        type: 'countdown',
        order: 6,
        settings: {
          title: 'Bahar Kampanyası',
          description: 'Seçili ürünlerde %50 indirim — kaçırma!',
          endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-best',
        type: 'best-sellers',
        order: 7,
        settings: { title: 'Çok Satanlar', limit: 4 },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-text-image',
        type: 'text-image',
        order: 8,
        settings: {
          title: 'Hikayemiz',
          body: 'Yerel üreticiden, kapınıza kadar. Kaliteli ürünleri uygun fiyatlarla sunmak için 2018\'den beri çalışıyoruz.',
          ctaLabel: 'Daha Fazla',
          ctaHref: '/hakkimizda',
          imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200',
          imagePosition: 'right',
        },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-testimonials',
        type: 'testimonials',
        order: 9,
        settings: { title: 'Müşterilerimiz Ne Diyor?', limit: 3 },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-brands',
        type: 'brand-showcase',
        order: 10,
        settings: { title: 'Markalarımız' },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-blog',
        type: 'blog-list',
        order: 11,
        settings: { title: 'Blog\'dan', limit: 3 },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-newsletter',
        type: 'newsletter',
        order: 12,
        settings: {
          title: 'Bültenimize Katılın',
          description: 'Kampanyalardan ilk siz haberdar olun, %10 indirim kazanın.',
        },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'b-faq',
        type: 'faq',
        order: 13,
        settings: { title: 'Sık Sorulan Sorular' },
        visibility: { desktop: true, mobile: true },
      },
    ];
  },
  ['home-blocks'],
  { tags: ['page-blocks-home'], revalidate: 300 },
);

async function getHomePageBlocks(sdk: StorefrontSdk): Promise<PageBlockRecord[]> {
  const payload = await sdk.pageBySlug('home');
  if (payload?.blocks?.length) {
    return payload.blocks.map((block) => ({
      ...block,
      type: block.type as PageBlockRecord['type'],
    }));
  }

  // Demo blokları yalnızca geliştirmede kullanılabilir. Production'da CMS
  // verisi yoksa boş mağaza render edilir; sahte ürün gösterilmez.
  if (process.env['NODE_ENV'] === 'development') {
    return getDemoHomePageBlocks();
  }
  return [];
}

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const host = headerStore.get('host') ?? 'demo.eticart.local';
  const ctx = await resolveStorefrontTenant(host);
  if (!ctx) return { title: 'EtiCart' };
  const { theme } = await loadTheme({
    ctx,
    demoData: process.env['NODE_ENV'] === 'development' ? demoData : undefined,
    backendUrl: process.env['NEXT_PUBLIC_STORE_API'],
  });
  return {
    title: theme.seo.defaultTitle || 'Mağaza',
    description: theme.seo.defaultDescription,
    openGraph: {
      title: theme.seo.defaultTitle,
      description: theme.seo.defaultDescription,
      images: theme.seo.defaultOgImage ? [theme.seo.defaultOgImage] : [],
      locale: 'tr_TR',
      type: 'website',
    },
    robots: theme.seo.robots,
  };
}

export default async function HomePage({ previewToken }: { previewToken?: string } = {}) {
  const headerStore = await headers();
  const host = headerStore.get('host') ?? 'demo.eticart.local';
  const ctx = await resolveStorefrontTenant(host);
  if (!ctx) {
    return <div>Tenant çözümlenemedi.</div>;
  }
  const { theme, sdk } = await loadTheme({
    ctx,
    demoData: process.env['NODE_ENV'] === 'development' ? demoData : undefined,
    backendUrl: process.env['NEXT_PUBLIC_STORE_API'],
    previewToken,
  });
  const blocks = await getHomePageBlocks(sdk);
  const cls = themeClass(theme.manifest.id);

  const supportedBlocks = supportedBlocksForTheme(theme.manifest);
  const rendered = await Promise.all(
    blocks.filter((block) => supportedBlocks.has(block.type)).map(async (block, index) => {
      try {
        return (
          <Fragment key={block.id ?? `${block.type}-${index}`}>
            {await renderStorefrontBlock(block, { sdk, themeClass: cls })}
          </Fragment>
        );
      } catch (err) {
        // Blok render hatası: geliştirme sırasında logla, prod'da sessizce atla
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.error(`[home] blok render hatası (${block.type}):`, err);
        }
        return null;
      }
    }),
  );

  return <>{rendered}</>;
}
