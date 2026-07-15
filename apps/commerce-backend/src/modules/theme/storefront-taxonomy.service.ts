import { Inject, Injectable } from '@nestjs/common';
import { ControlPrismaService, CONTROL_PRISMA_TOKEN } from '../../db/prisma.service.js';

interface CategoryRow {
  id: string; tenant_id: string; parent_id: string | null; slug: string; name: string;
  description: string | null; image_url: string | null; product_count: string;
}

interface BrandRow {
  id: string; slug: string; name: string; logo_url: string | null; product_count: string;
}

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
  children: CategoryNode[];
}

function categoryNode(row: CategoryRow): CategoryNode {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    productCount: Number(row.product_count ?? 0),
    children: [],
  };
}

@Injectable()
export class StorefrontTaxonomyService {
  constructor(@Inject(CONTROL_PRISMA_TOKEN) private readonly prisma: ControlPrismaService) {}

  async categories(tenantId: string) {
    const rows = await this.prisma.client.$queryRawUnsafe<CategoryRow[]>(
      `SELECT c.id, c."tenantId" AS tenant_id, c."parentId" AS parent_id, c.slug, c.name, c.description,
              c."imageKey" AS image_url,
              COUNT(DISTINCT CASE WHEN p.status = 'active' AND p."deletedAt" IS NULL THEN p.id END)::text AS product_count
       FROM categories c
       LEFT JOIN product_category_links pcl ON pcl."categoryId" = c.id AND pcl."tenantId" = c."tenantId"
       LEFT JOIN products p ON p.id = pcl."productId" AND p."tenantId" = c."tenantId"
       WHERE c."tenantId" = $1::uuid AND c."isActive" = TRUE
       GROUP BY c.id ORDER BY c.position ASC, c.name ASC`,
      tenantId,
    );
    const nodes = rows.map(categoryNode);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const roots: typeof nodes = [];
    for (const [index, row] of rows.entries()) {
      const node = nodes[index]!;
      const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async categoryBySlug(tenantId: string, slug: string) {
    const rows = await this.prisma.client.$queryRawUnsafe<CategoryRow[]>(
      `SELECT c.id, c."tenantId" AS tenant_id, c."parentId" AS parent_id, c.slug, c.name, c.description,
              c."imageKey" AS image_url,
              COUNT(DISTINCT CASE WHEN p.status = 'active' AND p."deletedAt" IS NULL THEN p.id END)::text AS product_count
       FROM categories c
       LEFT JOIN product_category_links pcl ON pcl."categoryId" = c.id AND pcl."tenantId" = c."tenantId"
       LEFT JOIN products p ON p.id = pcl."productId" AND p."tenantId" = c."tenantId"
       WHERE c."tenantId" = $1::uuid AND c.slug = $2 AND c."isActive" = TRUE
       GROUP BY c.id LIMIT 1`,
      tenantId,
      slug,
    );
    const row = rows[0];
    return row ? categoryNode(row) : null;
  }

  async brands(tenantId: string) {
    const rows = await this.prisma.client.$queryRawUnsafe<BrandRow[]>(
      `SELECT b.id, b.slug, b.name, b."logoKey" AS logo_url,
              COUNT(DISTINCT CASE WHEN p.status = 'active' AND p."deletedAt" IS NULL THEN p.id END)::text AS product_count
       FROM brands b
       LEFT JOIN products p ON p."brandId" = b.id AND p."tenantId" = b."tenantId"
       WHERE b."tenantId" = $1::uuid
       GROUP BY b.id ORDER BY b.name ASC`,
      tenantId,
    );
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      logoUrl: row.logo_url,
      productCount: Number(row.product_count ?? 0),
    }));
  }
}
