import type { StorefrontSdk } from '@eticart/storefront-sdk';
import type { PageBlockRecord, ThemeBlockType, ThemeManifest } from '@eticart/theme-engine';
import {
  BestSellersBlock,
  BannerGridBlock,
  BrandShowcaseBlock,
  CategoryShowcaseBlock,
  CountdownBlock,
  FaqBlock,
  FeaturedProductsBlock,
  HeroBlock,
  HtmlBlock,
  NewProductsBlock,
  NewsletterBlock,
  SliderBlock,
  TestimonialsBlock,
  TextImageBlock,
  VideoEmbedBlock,
  BlogListBlock,
} from './registry';

export interface StorefrontBlockContext {
  sdk: StorefrontSdk;
  themeClass: string;
}

type Renderer = (props: { block: PageBlockRecord; sdk: StorefrontSdk; themeClass: string }) => Promise<JSX.Element | null>;

const renderers = new Map<ThemeBlockType, Renderer>();

export function registerStorefrontBlock(type: ThemeBlockType, renderer: Renderer): void {
  if (renderers.has(type)) throw new Error(`Storefront block zaten kayıtlı: ${type}`);
  renderers.set(type, renderer);
}

export function getStorefrontBlock(type: string): Renderer | undefined {
  return renderers.get(type as ThemeBlockType);
}

export function supportedStorefrontBlocks(): ReadonlyArray<ThemeBlockType> {
  return Array.from(renderers.keys());
}

/** Manifest ile gerçek renderer kayıtlarının kesişimini döndürür. */
export function supportedBlocksForTheme(manifest: ThemeManifest): ReadonlySet<ThemeBlockType> {
  const registered = new Set(supportedStorefrontBlocks());
  return new Set(manifest.blocks.filter((type) => registered.has(type)));
}

export async function renderStorefrontBlock(
  block: PageBlockRecord,
  ctx: StorefrontBlockContext,
): Promise<JSX.Element | null> {
  const renderer = getStorefrontBlock(block.type);
  if (!renderer) return null;
  return renderer({ block, sdk: ctx.sdk, themeClass: ctx.themeClass });
}

registerStorefrontBlock('hero', HeroBlock);
registerStorefrontBlock('slider', SliderBlock);
registerStorefrontBlock('banner-grid', BannerGridBlock);
registerStorefrontBlock('featured-products', FeaturedProductsBlock);
registerStorefrontBlock('new-products', NewProductsBlock);
registerStorefrontBlock('best-sellers', BestSellersBlock);
registerStorefrontBlock('category-showcase', CategoryShowcaseBlock);
registerStorefrontBlock('brand-showcase', BrandShowcaseBlock);
registerStorefrontBlock('countdown', CountdownBlock);
registerStorefrontBlock('text-image', TextImageBlock);
registerStorefrontBlock('video-embed', VideoEmbedBlock);
registerStorefrontBlock('testimonials', TestimonialsBlock);
registerStorefrontBlock('blog-list', BlogListBlock);
registerStorefrontBlock('newsletter', NewsletterBlock);
registerStorefrontBlock('faq', FaqBlock);
registerStorefrontBlock('html', HtmlBlock);
