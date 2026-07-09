/**
 * Ürün ve katalog tipleri — Faz 4 iskeleti.
 */

import type { Uuid, IsoDateString } from '../common/index.js';

/** Ürün durumu. */
export type ProductStatus = 'draft' | 'published' | 'archived';

/** Ürün varyantı (SKU). */
export interface ProductVariant {
  id: Uuid;
  sku: string;
  name: string;
  priceKurus: number;
  stockQty: number;
  attributes: Readonly<Record<string, string>>;
}

/** Ürün kategorisi. */
export interface ProductCategory {
  id: Uuid;
  slug: string;
  name: string;
  parentId: Uuid | null;
}

/** Ürün ana verisi. */
export interface Product {
  id: Uuid;
  slug: string;
  title: string;
  description: string;
  status: ProductStatus;
  categories: ReadonlyArray<ProductCategory>;
  variants: ReadonlyArray<ProductVariant>;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}
