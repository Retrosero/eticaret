import { Inject, Injectable } from '@nestjs/common';
import { ControlPrismaService, CONTROL_PRISMA_TOKEN } from '../../db/prisma.service.js';

interface PageRow {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: 'draft' | 'published' | 'archived';
  updated_at: Date;
  blocks: unknown;
}

interface SeoRow {
  title_template: string;
  default_title: string;
  default_description: string;
  default_og_image: string | null;
  canonical_base: string | null;
  robots: string;
}

function normalizeBlocks(input: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const block = item as Record<string, unknown>;
    const type = typeof block.type === 'string' ? block.type : null;
    if (!type) return [];
    const visibility = block.visibility && typeof block.visibility === 'object'
      ? block.visibility as Record<string, unknown>
      : {};
    return [{
      id: typeof block.id === 'string' ? block.id : `block-${index + 1}`,
      type,
      order: typeof block.order === 'number' ? block.order : index,
      settings: block.settings && typeof block.settings === 'object' ? block.settings : {},
      visibility: {
        desktop: visibility.desktop !== false,
        mobile: visibility.mobile !== false,
      },
    }];
  });
}

@Injectable()
export class StorefrontPagesService {
  constructor(@Inject(CONTROL_PRISMA_TOKEN) private readonly prisma: ControlPrismaService) {}

  async getPage(tenantId: string, slug: string): Promise<unknown | null> {
    const rows = await this.prisma.client.$queryRawUnsafe<PageRow[]>(
      `SELECT p.id, p.slug, p.title, p.type, p.status, p.updated_at,
              COALESCE(r.blocks, '[]'::jsonb) AS blocks
       FROM public.pages p
       LEFT JOIN public.page_revisions r ON r.id = p.current_revision_id
       WHERE p.tenant_id = $1::uuid AND p.slug = $2 AND p.status = 'published'
       LIMIT 1`,
      tenantId,
      slug,
    );
    const page = rows[0];
    if (!page) return null;

    const seoRows = await this.prisma.client.$queryRawUnsafe<SeoRow[]>(
      `SELECT title_template, default_title, default_description,
              default_og_image, canonical_base, robots
       FROM public.seo_settings
       WHERE tenant_id = $1::uuid LIMIT 1`,
      tenantId,
    );
    const seo = seoRows[0];
    const title = seo?.default_title || page.title;
    const canonicalUrl = seo?.canonical_base
      ? `${seo.canonical_base.replace(/\/$/, '')}/${page.slug === 'home' ? '' : page.slug}`
      : null;

    return {
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        type: page.type,
        status: page.status,
        updatedAt: page.updated_at.toISOString(),
      },
      blocks: normalizeBlocks(page.blocks).sort((a, b) => Number(a.order) - Number(b.order)),
      seo: {
        title: seo?.title_template?.replace('%s', title) ?? title,
        description: seo?.default_description ?? '',
        ogImageUrl: seo?.default_og_image ?? null,
        canonicalUrl,
        robots: seo?.robots ?? 'index, follow',
      },
      breadcrumbs: [],
    };
  }

  async listPages(tenantId: string): Promise<unknown[]> {
    const rows = await this.prisma.client.$queryRawUnsafe<Array<Pick<PageRow, 'id' | 'slug' | 'title' | 'type' | 'status' | 'updated_at'>>>(
      `SELECT id, slug, title, type, status, updated_at
       FROM public.pages
       WHERE tenant_id = $1::uuid AND status = 'published'
       ORDER BY updated_at DESC`,
      tenantId,
    );
    return rows.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      type: page.type,
      status: page.status,
      updatedAt: page.updated_at.toISOString(),
    }));
  }
}
