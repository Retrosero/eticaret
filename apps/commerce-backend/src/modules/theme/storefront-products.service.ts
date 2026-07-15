import { Inject, Injectable } from '@nestjs/common';
import { PrismaService, PRISMA_TOKEN } from '../../db/prisma.service.js';

interface ProductRow {
  id: string; slug: string; title: string; short_description: string | null;
  description: string | null; brand_id: string | null; brand_name: string | null;
  price_amount: string | number | null; currency: 'TRY' | 'EUR' | 'USD';
  stock_qty: number | null; reserved_qty: number | null; main_image_url: string | null;
  updated_at: Date; published_at: Date | null;
}

const money = (value: string | number | null): number => Math.round(Number(value ?? 0) * 100);

function publicMediaUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = (process.env['S3_PUBLIC_BASE_URL'] ?? process.env['MEDIA_PUBLIC_BASE_URL'] ?? 'https://media.eticart.com.tr').replace(/\/$/u, '');
  return `${base}/${value.replace(/^\/+/, '')}`;
}

function summary(row: ProductRow) {
  return {
    id: row.id, slug: row.slug, title: row.title,
    shortDescription: row.short_description ?? '', priceKurus: money(row.price_amount),
    compareAtKurus: null, currency: row.currency, mainImageUrl: publicMediaUrl(row.main_image_url),
    inStock: Number(row.stock_qty ?? 0) > Number(row.reserved_qty ?? 0),
    isNew: row.published_at ? Date.now() - row.published_at.getTime() < 30 * 86400000 : false,
    isFeatured: false, isBestSeller: false, rating: null, reviewCount: 0,
    brandName: row.brand_name,
  };
}

@Injectable()
export class StorefrontProductsService {
  constructor(@Inject(PRISMA_TOKEN) private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20) || 20));
    const params: unknown[] = [tenantId];
    const where = [`p."tenantId" = $1::uuid`, `p.status = 'active'`, `p."deletedAt" IS NULL`];
    const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.split('$X').join(`$${params.length}`)); };
    if (query.q) add(`(p.title ILIKE '%' || $X || '%' OR p."shortDescription" ILIKE '%' || $X || '%')`, query.q);
    if (query.category) add(`EXISTS (SELECT 1 FROM product_category_links pcl JOIN categories c ON c.id = pcl."categoryId" WHERE pcl."productId" = p.id AND pcl."tenantId" = $X AND c.slug = $X)`, query.category);
    if (query.brand) add(`EXISTS (SELECT 1 FROM brands b WHERE b.id = p."brandId" AND b."tenantId" = $X AND b.slug = $X)`, query.brand);
    if (query.in_stock === '1') where.push(`COALESCE(v."stockQty", 0) > COALESCE(v."reservedQty", 0)`);
    if (query.new === '1') where.push(`p."publishedAt" >= NOW() - INTERVAL '30 days'`);
    const order = query.sort === 'price-asc' ? 'v."priceAmount" ASC' : query.sort === 'price-desc' ? 'v."priceAmount" DESC' : 'p."publishedAt" DESC NULLS LAST';
    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const rows = await this.prisma.client.$queryRawUnsafe<ProductRow[]>(
      `SELECT p.id, p.slug, p.title, p."shortDescription" AS short_description, p.description, p."brandId" AS brand_id,
              b.name AS brand_name, v."priceAmount" AS price_amount, v.currency, v."stockQty" AS stock_qty, v."reservedQty" AS reserved_qty,
              pm."storageKey" AS main_image_url, p."updatedAt" AS updated_at, p."publishedAt" AS published_at
       FROM products p LEFT JOIN brands b ON b.id = p."brandId"
       LEFT JOIN LATERAL (SELECT "priceAmount", currency, "stockQty", "reservedQty" FROM product_variants WHERE "productId" = p.id ORDER BY "isDefault" DESC, position ASC LIMIT 1) v ON TRUE
       LEFT JOIN LATERAL (SELECT "storageKey" FROM product_media WHERE "productId" = p.id ORDER BY "isPrimary" DESC, position ASC LIMIT 1) pm ON TRUE
       WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      ...params,
    );
    const count = await this.prisma.client.$queryRawUnsafe<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total FROM products p WHERE ${where.join(' AND ')}`,
      ...params.slice(0, -2),
    );
    const total = Number(count[0]?.total ?? 0);
    return { items: rows.map(summary), total, page, pageSize, hasMore: offset + rows.length < total };
  }

  async detail(tenantId: string, slug: string) {
    const rows = await this.prisma.client.$queryRawUnsafe<ProductRow[]>(
      `SELECT p.id, p.slug, p.title, p."shortDescription" AS short_description, p.description, p."brandId" AS brand_id,
              b.name AS brand_name, v."priceAmount" AS price_amount, v.currency, v."stockQty" AS stock_qty, v."reservedQty" AS reserved_qty,
              pm."storageKey" AS main_image_url, p."updatedAt" AS updated_at, p."publishedAt" AS published_at
       FROM products p LEFT JOIN brands b ON b.id = p."brandId"
       LEFT JOIN LATERAL (SELECT "priceAmount", currency, "stockQty", "reservedQty" FROM product_variants WHERE "productId" = p.id ORDER BY "isDefault" DESC, position ASC LIMIT 1) v ON TRUE
       LEFT JOIN LATERAL (SELECT "storageKey" FROM product_media WHERE "productId" = p.id ORDER BY "isPrimary" DESC, position ASC LIMIT 1) pm ON TRUE
       WHERE p."tenantId" = $1::uuid AND p.slug = $2 AND p.status = 'active' AND p."deletedAt" IS NULL LIMIT 1`,
      tenantId, slug,
    );
    const row = rows[0];
    if (!row) return null;
    const media = await this.prisma.client.$queryRawUnsafe<Array<{ id: string; storage_key: string; alt_text: string | null; position: number }>>(
      `SELECT id, "storageKey" AS storage_key, "altText" AS alt_text, position FROM product_media WHERE "tenantId" = $1::uuid AND "productId" = $2::uuid ORDER BY position ASC`, tenantId, row.id,
    );
    const variants = await this.prisma.client.$queryRawUnsafe<Array<{ id: string; sku: string; name: string | null; price_amount: string | number; stock_qty: number; currency: 'TRY' | 'EUR' | 'USD' }>>(
      `SELECT id, sku, name, "priceAmount" AS price_amount, "stockQty" AS stock_qty, currency FROM product_variants WHERE "tenantId" = $1::uuid AND "productId" = $2::uuid ORDER BY position ASC`, tenantId, row.id,
    );
    return {
      ...summary(row), description: row.description ?? '',
      images: media.map((item) => ({ id: item.id, url: publicMediaUrl(item.storage_key)!, alt: item.alt_text ?? row.title, order: item.position })),
      variants: variants.map((item) => ({ id: item.id, sku: item.sku, name: item.name ?? item.sku, priceKurus: money(item.price_amount), stockQty: item.stock_qty, attributes: {}, imageUrl: null })),
      attributes: [], categories: [], brand: row.brand_id && row.brand_name ? { id: row.brand_id, name: row.brand_name, logoUrl: null } : null,
      seo: { title: null, description: null, ogImageUrl: publicMediaUrl(row.main_image_url) }, updatedAt: row.updated_at.toISOString(),
    };
  }
}
