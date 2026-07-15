import Image from 'next/image';
import type { StorefrontProductDetail } from '@eticart/storefront-sdk';

export interface ProductGalleryProps {
  product: StorefrontProductDetail;
  themeClass: string;
}

/** Varsayılan ürün galerisi; tema registry'si üzerinden override edilebilir. */
export function ProductGallery({ product, themeClass }: ProductGalleryProps): JSX.Element {
  return (
    <div className={`${themeClass}-product-gallery theme-product-gallery`}>
      {product.images.length > 0 ? product.images.map((image, index) => (
        <div key={image.id} className="theme-product-gallery__item" style={{ position: 'relative', aspectRatio: '1 / 1', marginBottom: 12 }}>
          <Image src={image.url} alt={image.alt || product.title} fill sizes="(max-width: 768px) 100vw, 55vw" priority={index === 0} />
        </div>
      )) : <div className="theme-empty">Ürün görseli bulunmuyor.</div>}
    </div>
  );
}
