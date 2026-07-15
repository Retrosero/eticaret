import Image from 'next/image';
import Link from 'next/link';
import type { StorefrontProductSummary } from '@eticart/storefront-sdk';

export type ProductCardVariant = 'horizontal' | 'vertical' | 'compact';

export interface ProductCardProps {
  product: StorefrontProductSummary;
  variant: ProductCardVariant;
  themeClass: string;
}

export function formatMoney(kurus: number, currency = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(kurus / 100);
}

export function ProductCard({ product, variant, themeClass }: ProductCardProps): JSX.Element {
  const cardClass = `${themeClass}-product-card theme-product-card theme-product-card--${variant}`;
  const imageClass = `${themeClass}-product-card__image theme-product-card__image`;
  return (
    <Link href={`/urun/${product.slug}`} className={cardClass} prefetch={false}>
      <div className={imageClass}>
        {product.mainImageUrl ? (
          <Image src={product.mainImageUrl} alt={product.title} fill sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="theme-muted">Görsel yok</div>
        )}
        {product.isNew && <span className="theme-product-card__badge">Yeni</span>}
        {product.isBestSeller && <span className="theme-product-card__badge theme-product-card__badge--accent">Çok Satan</span>}
      </div>
      <div className="theme-product-card__body">
        {product.brandName && <span className="theme-product-card__brand theme-muted">{product.brandName}</span>}
        <h3 className="theme-product-card__title">{product.title}</h3>
        <div>
          <span className="theme-product-card__price">{formatMoney(product.priceKurus, product.currency)}</span>
          {product.compareAtKurus && product.compareAtKurus > product.priceKurus && <span className="theme-product-card__compare-at">{formatMoney(product.compareAtKurus, product.currency)}</span>}
        </div>
      </div>
    </Link>
  );
}
