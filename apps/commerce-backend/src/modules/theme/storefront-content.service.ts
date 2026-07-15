import { Inject, Injectable } from '@nestjs/common';
import { ControlPrismaService, CONTROL_PRISMA_TOKEN } from '../../db/prisma.service.js';

@Injectable()
export class StorefrontContentService {
  constructor(@Inject(CONTROL_PRISMA_TOKEN) private readonly prisma: ControlPrismaService) {}

  async banners(tenantId: string, placement: string) {
    const rows = await this.prisma.client.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, title, subtitle, image_key, image_mobile_key, cta_label, cta_href, sort_order
       FROM public.storefront_banners
       WHERE tenant_id = $1::uuid AND placement = $2 AND status = 'published'
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY sort_order ASC, created_at ASC`, tenantId, placement,
    );
    return rows.map((row) => ({
      id: String(row.id), title: String(row.title), subtitle: row.subtitle as string | null,
      imageUrl: String(row.image_key), imageMobileUrl: row.image_mobile_key as string | null,
      ctaLabel: row.cta_label as string | null, ctaHref: row.cta_href as string | null,
      order: Number(row.sort_order ?? 0),
    }));
  }

  async blogPosts(tenantId: string, limit: number) {
    const rows = await this.prisma.client.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, slug, title, excerpt, image_key, published_at, reading_time_min
       FROM public.storefront_blog_posts
       WHERE tenant_id = $1::uuid AND status = 'published' AND published_at IS NOT NULL
       ORDER BY published_at DESC LIMIT $2`, tenantId, limit,
    );
    return rows.map((row) => ({
      id: String(row.id), slug: String(row.slug), title: String(row.title),
      excerpt: String(row.excerpt ?? ''), imageUrl: row.image_key as string | null,
      publishedAt: new Date(String(row.published_at)).toISOString(),
      readingTimeMin: Number(row.reading_time_min ?? 1),
    }));
  }

  async testimonials(tenantId: string, limit: number) {
    const rows = await this.prisma.client.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, customer_name, customer_title, rating, comment, avatar_key, approved_at
       FROM public.storefront_testimonials
       WHERE tenant_id = $1::uuid AND status = 'approved' AND approved_at IS NOT NULL
       ORDER BY approved_at DESC LIMIT $2`, tenantId, limit,
    );
    return rows.map((row) => ({
      id: String(row.id), customerName: String(row.customer_name),
      customerTitle: row.customer_title as string | null, rating: Number(row.rating),
      comment: String(row.comment), avatarUrl: row.avatar_key as string | null,
      approvedAt: new Date(String(row.approved_at)).toISOString(),
    }));
  }
}
