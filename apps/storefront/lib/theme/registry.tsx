/**
 * Storefront — ortak blok bileşenleri.
 *
 * Bu bileşenler her iki temada da kullanılır; görsel varyasyon `themeClass`
 * ve `variant` parametreleri ile sağlanır. Tüm bileşenler server component
 * olarak çalışır (async). Veri `StorefrontSdk` üzerinden çekilir — doğrudan
 * DB / API sorgusu yapılmaz.
 */

import Image from 'next/image';
import Link from 'next/link';
import type { StorefrontSdk, StorefrontProductSummary, StorefrontCategory, StorefrontBanner, StorefrontBlogPost, StorefrontTestimonial, StorefrontBrand } from '@eticart/storefront-sdk';
import type { PageBlockRecord } from '@eticart/theme-engine';

/** Para birimi formatı (TRY/EUR/USD, kuruş → birim). */
export function formatMoney(kurus: number, currency: string = 'TRY'): string {
  const value = kurus / 100;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
  }).format(value);
}

/** Tarih formatı (ISO → Türkçe). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Ürün kartı — variant'lara göre farklı görsel varyasyonlar.
 * variant: 'horizontal' | 'vertical' | 'compact'
 */
export function ProductCard(props: {
  product: StorefrontProductSummary;
  variant: 'horizontal' | 'vertical' | 'compact';
  themeClass: string;
}): JSX.Element {
  const { product, variant, themeClass } = props;
  const cardClass = `${themeClass}-product-card theme-product-card theme-product-card--${variant}`;
  const imageClass = `${themeClass}-product-card__image theme-product-card__image`;

  return (
    <Link href={`/urun/${product.slug}`} className={cardClass} prefetch={false}>
      <div className={imageClass}>
        {product.mainImageUrl ? (
          <Image
            src={product.mainImageUrl}
            alt={product.title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="theme-muted">
            Görsel yok
          </div>
        )}
        {product.isNew && <span className="theme-product-card__badge">Yeni</span>}
        {product.isBestSeller && <span className="theme-product-card__badge theme-product-card__badge--accent">Çok Satan</span>}
      </div>
      <div className="theme-product-card__body">
        {product.brandName && (
          <span className="theme-product-card__brand theme-muted">{product.brandName}</span>
        )}
        <h3 className="theme-product-card__title">{product.title}</h3>
        <div>
          <span className="theme-product-card__price">
            {formatMoney(product.priceKurus, product.currency)}
          </span>
          {product.compareAtKurus && product.compareAtKurus > product.priceKurus && (
            <span className="theme-product-card__compare-at">
              {formatMoney(product.compareAtKurus, product.currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Hero blok — büyük banner + başlık + CTA. */
export async function HeroBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    subtitle?: string;
    ctaLabel?: string;
    ctaHref?: string;
    imageUrl?: string;
    align?: 'left' | 'center' | 'right';
  };

  const title = settings.title ?? 'Modern Alışveriş Deneyimi';
  const subtitle = settings.subtitle ?? 'En yeni koleksiyonlar, en uygun fiyatlarla.';
  const align = settings.align ?? 'left';

  return (
    <section className={`${props.themeClass}-hero`} aria-label="Hero banner">
      <div className="theme-container">
        <div className={`${props.themeClass}-hero__inner theme-hero theme-hero--${align}`}>
          {settings.imageUrl && (
            <div className="theme-hero__media">
              <Image
                src={settings.imageUrl}
                alt={title}
                fill
                sizes="100vw"
                priority
              />
            </div>
          )}
          <div className="theme-hero__content">
            <h1 className="theme-hero__title">{title}</h1>
            {subtitle && <p className="theme-hero__subtitle">{subtitle}</p>}
            {settings.ctaLabel && settings.ctaHref && (
              <Link href={settings.ctaHref} className="theme-btn theme-btn-primary">
                {settings.ctaLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Slider / banner carousel blok. */
export async function SliderBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    placement?: string;
    autoPlay?: boolean;
    interval?: number;
  };
  const placement = settings.placement ?? 'home-slider';
  const banners: ReadonlyArray<StorefrontBanner> = await props.sdk.banners(placement);
  if (banners.length === 0) return null;

  return (
    <section className={`${props.themeClass}-slider`} aria-label="Banner slider">
      <div className="theme-container">
        <div className="theme-slider">
          {banners.map((banner) => (
            <div key={banner.id} className="theme-slider__slide">
              {banner.imageUrl && (
                <div className="theme-slider__image">
                  <Image
                    src={banner.imageUrl}
                    alt={banner.title}
                    fill
                    sizes="100vw"
                    priority={banner.order === 1}
                  />
                </div>
              )}
              <div className="theme-slider__overlay">
                <h2 className="theme-slider__title">{banner.title}</h2>
                {banner.subtitle && <p className="theme-slider__subtitle">{banner.subtitle}</p>}
                {banner.ctaLabel && banner.ctaHref && (
                  <Link href={banner.ctaHref} className="theme-btn theme-btn-primary">
                    {banner.ctaLabel}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Banner grid (2/3/4 sütun). */
export async function BannerGridBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    placement?: string;
    columns?: 2 | 3 | 4;
  };
  const columns = settings.columns ?? 3;
  const banners = await props.sdk.banners(settings.placement ?? 'home-banner-grid');
  if (banners.length === 0) return null;

  return (
    <section className={`${props.themeClass}-banner-grid`}>
      <div className="theme-container">
        <div className={`theme-grid theme-grid--cols-${columns}`}>
          {banners.map((banner) => (
            <Link key={banner.id} href={banner.ctaHref ?? '#'} className="theme-banner-grid__cell">
              {banner.imageUrl && (
                <Image src={banner.imageUrl} alt={banner.title} fill sizes="(max-width: 768px) 50vw, 33vw" />
              )}
              <div className="theme-banner-grid__overlay">
                <span>{banner.title}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Öne çıkan ürünler. */
export async function FeaturedProductsBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    limit?: number;
    cardVariant?: 'horizontal' | 'vertical' | 'compact';
  };
  const limit = settings.limit ?? 8;
  const products = await props.sdk.featuredProducts(limit);
  if (products.length === 0) return null;
  const cardVariant = settings.cardVariant ?? 'vertical';

  return (
    <section className={`${props.themeClass}-featured theme-section`}>
      <div className="theme-container">
        <h2 className="theme-section__title">
          {settings.title ?? 'Öne Çıkan Ürünler'}
          <Link href="/koleksiyon/one-cikanlar" className="theme-section__title-link">
            Tümünü Gör
          </Link>
        </h2>
        <div className="theme-grid theme-grid--cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} variant={cardVariant} themeClass={props.themeClass} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Yeni ürünler. */
export async function NewProductsBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    limit?: number;
    cardVariant?: 'horizontal' | 'vertical' | 'compact';
  };
  const limit = settings.limit ?? 8;
  const products = await props.sdk.newProducts(limit);
  if (products.length === 0) return null;
  const cardVariant = settings.cardVariant ?? 'vertical';

  return (
    <section className={`${props.themeClass}-new theme-section`}>
      <div className="theme-container">
        <h2 className="theme-section__title">
          {settings.title ?? 'Yeni Gelenler'}
        </h2>
        <div className="theme-grid theme-grid--cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} variant={cardVariant} themeClass={props.themeClass} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Çok satanlar. */
export async function BestSellersBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    limit?: number;
    cardVariant?: 'horizontal' | 'vertical' | 'compact';
  };
  const limit = settings.limit ?? 8;
  const products = await props.sdk.bestSellers(limit);
  if (products.length === 0) return null;
  const cardVariant = settings.cardVariant ?? 'vertical';

  return (
    <section className={`${props.themeClass}-best theme-section`}>
      <div className="theme-container">
        <h2 className="theme-section__title">
          {settings.title ?? 'Çok Satanlar'}
        </h2>
        <div className="theme-grid theme-grid--cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} variant={cardVariant} themeClass={props.themeClass} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Kategori vitrini. */
export async function CategoryShowcaseBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    limit?: number;
  };
  const categories: ReadonlyArray<StorefrontCategory> = await props.sdk.categories();
  if (categories.length === 0) return null;
  const limit = settings.limit ?? 6;
  const flat: StorefrontCategory[] = [];
  for (const c of categories) {
    flat.push(c);
    for (const child of c.children) flat.push(child);
    if (flat.length >= limit) break;
  }

  return (
    <section className={`${props.themeClass}-categories theme-section`}>
      <div className="theme-container">
        <h2 className="theme-section__title">
          {settings.title ?? 'Kategoriler'}
        </h2>
        <div className="theme-grid theme-grid--cols-6">
          {flat.slice(0, limit).map((c) => (
            <Link key={c.id} href={`/kategori/${c.slug}`} className="theme-category-tile">
              {c.imageUrl ? (
                <Image src={c.imageUrl} alt={c.name} fill sizes="(max-width: 768px) 33vw, 16vw" />
              ) : (
                <div className="theme-category-tile__placeholder">
                  <span>{c.name.charAt(0)}</span>
                </div>
              )}
              <span className="theme-category-tile__label">{c.name}</span>
              <span className="theme-category-tile__count theme-muted">{c.productCount} ürün</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Marka vitrini. */
export async function BrandShowcaseBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
  };
  const brands: ReadonlyArray<StorefrontBrand> = await props.sdk.brands();
  if (brands.length === 0) return null;
  return (
    <section className={`${props.themeClass}-brands theme-section`}>
      <div className="theme-container">
        <h2 className="theme-section__title">{settings.title ?? 'Markalar'}</h2>
        <div className="theme-grid theme-grid--cols-6">
          {brands.map((b) => (
            <Link key={b.id} href={`/marka/${b.slug}`} className="theme-brand-tile">
              {b.logoUrl ? (
                <Image src={b.logoUrl} alt={b.name} fill sizes="16vw" />
              ) : (
                <span>{b.name}</span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Kampanya sayacı. */
export async function CountdownBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    endAt?: string;
    description?: string;
  };
  if (!settings.endAt) return null;

  return (
    <section className={`${props.themeClass}-countdown`}>
      <div className="theme-container">
        <div className="theme-countdown">
          <div>
            <h2 className="theme-countdown__title">{settings.title ?? 'Süper Fırsat'}</h2>
            {settings.description && <p className="theme-countdown__desc">{settings.description}</p>}
          </div>
          <CountdownTimer endAt={settings.endAt} />
        </div>
      </div>
    </section>
  );
}

/** Sunucu tarafında render edilen countdown (client island olarak hidrasyon). */
function CountdownTimer({ endAt }: { endAt: string }): JSX.Element {
  const target = new Date(endAt).getTime();
  // İstemci tarafında hidrasyona kadar 0 gösterilir; bu SEO'yu bozmaz.
  const days = Math.max(0, Math.floor((target - Date.now()) / (1000 * 60 * 60 * 24)));
  return (
    <div className="theme-countdown__timer" data-countdown-end={endAt}>
      <span className="theme-countdown__cell">
        <strong>{days}</strong>
        <small>gün</small>
      </span>
      <span className="theme-countdown__cell">
        <strong>00</strong>
        <small>sa</small>
      </span>
      <span className="theme-countdown__cell">
        <strong>00</strong>
        <small>dk</small>
      </span>
    </div>
  );
}

/** Metin + görsel (2 sütun). */
export async function TextImageBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    body?: string;
    ctaLabel?: string;
    ctaHref?: string;
    imageUrl?: string;
    imagePosition?: 'left' | 'right';
  };
  const imagePos = settings.imagePosition ?? 'right';
  return (
    <section className={`${props.themeClass}-text-image theme-section`}>
      <div className="theme-container">
        <div className={`theme-text-image theme-text-image--${imagePos}`}>
          {settings.imageUrl && (
            <div className="theme-text-image__media">
              <Image src={settings.imageUrl} alt={settings.title ?? ''} fill sizes="(max-width: 768px) 100vw, 50vw" />
            </div>
          )}
          <div className="theme-text-image__content">
            {settings.title && <h2>{settings.title}</h2>}
            {settings.body && <p>{settings.body}</p>}
            {settings.ctaLabel && settings.ctaHref && (
              <Link href={settings.ctaHref} className="theme-btn theme-btn-primary">
                {settings.ctaLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Video embed. */
export async function VideoEmbedBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    videoUrl?: string;
    poster?: string;
  };
  if (!settings.videoUrl) return null;
  return (
    <section className={`${props.themeClass}-video theme-section`}>
      <div className="theme-container">
        {settings.title && <h2 className="theme-section__title">{settings.title}</h2>}
        <div className="theme-video">
          <video
            controls
            preload="metadata"
            poster={settings.poster}
            className="theme-video__player"
          >
            <source src={settings.videoUrl} />
            Tarayıcınız video etiketini desteklemiyor.
          </video>
        </div>
      </div>
    </section>
  );
}

/** Müşteri yorumları. */
export async function TestimonialsBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    limit?: number;
  };
  const items: ReadonlyArray<StorefrontTestimonial> = await props.sdk.testimonials(settings.limit ?? 6);
  if (items.length === 0) return null;
  return (
    <section className={`${props.themeClass}-testimonials theme-section`}>
      <div className="theme-container">
        <h2 className="theme-section__title">{settings.title ?? 'Müşteri Yorumları'}</h2>
        <div className="theme-grid theme-grid--cols-3">
          {items.map((t) => (
            <article key={t.id} className="theme-testimonial">
              <div className="theme-testimonial__rating" aria-label={`${t.rating} yıldız`}>
                {'★'.repeat(t.rating)}
                {'☆'.repeat(5 - t.rating)}
              </div>
              <p className="theme-testimonial__comment">{t.comment}</p>
              <footer className="theme-testimonial__author">
                {t.customerName}
                {t.customerTitle && <span className="theme-muted">, {t.customerTitle}</span>}
              </footer>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Blog yazıları. */
export async function BlogListBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    limit?: number;
  };
  const items: ReadonlyArray<StorefrontBlogPost> = await props.sdk.blogPosts(settings.limit ?? 3);
  if (items.length === 0) return null;
  return (
    <section className={`${props.themeClass}-blog theme-section`}>
      <div className="theme-container">
        <h2 className="theme-section__title">
          {settings.title ?? 'Blog'}
          <Link href="/blog" className="theme-section__title-link">Tüm Yazılar</Link>
        </h2>
        <div className="theme-grid theme-grid--cols-3">
          {items.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="theme-blog-card">
              {p.imageUrl && (
                <div className="theme-blog-card__image">
                  <Image src={p.imageUrl} alt={p.title} fill sizes="(max-width: 768px) 100vw, 33vw" />
                </div>
              )}
              <div className="theme-blog-card__body">
                <time className="theme-muted">{formatDate(p.publishedAt)} · {p.readingTimeMin} dk okuma</time>
                <h3>{p.title}</h3>
                <p>{p.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Newsletter (e-posta kayıt). */
export async function NewsletterBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    description?: string;
  };
  return (
    <section className={`${props.themeClass}-newsletter`}>
      <div className="theme-container">
        <div className="theme-newsletter">
          <h2 className="theme-newsletter__title">{settings.title ?? 'Bültenimize Katılın'}</h2>
          <p className="theme-newsletter__desc">
            {settings.description ?? 'Kampanyalardan ilk siz haberdar olun.'}
          </p>
          <form className="theme-newsletter__form" action="/api/newsletter/subscribe" method="post">
            <input
              type="email"
              name="email"
              required
              placeholder="E-posta adresiniz"
              className="theme-newsletter__input"
              aria-label="E-posta"
            />
            <button type="submit" className="theme-btn theme-btn-primary">
              Abone Ol
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

/** FAQ (sık sorulan sorular). */
export async function FaqBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    title?: string;
    items?: ReadonlyArray<{ question: string; answer: string }>;
  };
  const items = settings.items ?? [
    { question: 'Kargo ne kadar sürede gelir?', answer: 'Siparişler 1-3 iş günü içinde kargoya verilir.' },
    { question: 'İade koşulları nelerdir?', answer: '14 gün içinde ücretsiz iade hakkınız vardır.' },
    { question: 'Ödeme yöntemleri nelerdir?', answer: 'Kredi kartı, banka transferi ve kapıda ödeme.' },
  ];
  return (
    <section className={`${props.themeClass}-faq theme-section`}>
      <div className="theme-container">
        <h2 className="theme-section__title">{settings.title ?? 'Sık Sorulan Sorular'}</h2>
        <div className="theme-faq">
          {items.map((it, idx) => (
            <details key={idx} className="theme-faq__item">
              <summary>{it.question}</summary>
              <p>{it.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Özel HTML (sadece admin yetkisi ile). */
export async function HtmlBlock(props: {
  block: PageBlockRecord;
  sdk: StorefrontSdk;
  themeClass: string;
}): Promise<JSX.Element | null> {
  const settings = (props.block.settings ?? {}) as {
    html?: string;
  };
  // XSS koruması: sanitize etmeden render etme; burada sadece metin olarak göster
  if (!settings.html) return null;
  return (
    <section className={`${props.themeClass}-html theme-section`}>
      <div className="theme-container">
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{settings.html}</pre>
      </div>
    </section>
  );
}