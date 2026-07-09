/**
 * KB Controller — Public + Admin endpoint'ler.
 *
 * Public (auth gerekmez):
 *   GET   /api/kb/categories                       → Kategori listesi
 *   GET   /api/kb/categories/:slug                 → Kategori detayı + makaleler
 *   GET   /api/kb/articles                         → Yayınlanmış makaleler
 *   GET   /api/kb/articles/:slug                   → Makale detayı (view++)
 *   GET   /api/kb/search?q=...                     → Full-text search
 *   POST  /api/kb/articles/:id/helpful             → Helpful vote
 *   GET   /api/kb/articles/:id/related             → İlgili makaleler
 *   GET   /api/kb/popular                          → En çok görüntülenen
 *   GET   /api/kb/recent                           → Son eklenen
 *
 * Admin (super admin):
 *   POST  /api/admin/kb/categories                 → Yeni kategori
 *   PATCH /api/admin/kb/categories/:id             → Kategori güncelle
 *   DELETE /api/admin/kb/categories/:id            → Kategori sil
 *   POST  /api/admin/kb/articles                   → Yeni makale
 *   PATCH /api/admin/kb/articles/:id               → Makale güncelle
 *   DELETE /api/admin/kb/articles/:id              → Makale sil
 *   POST  /api/admin/kb/articles/:id/publish       → Yayınla
 *   GET   /api/admin/kb/articles/:id/versions      → Versiyon geçmişi
 *   GET   /api/admin/kb/stats                      → Platform istatistikleri
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';
import type { Request } from 'express';

import { KbService } from './kb.service.js';

const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).nullable().optional(),
  orderIndex: z.number().int().min(0).default(0),
  parentId: z.string().uuid().nullable().optional(),
});

const updateCategorySchema = createCategorySchema.partial();

const createArticleSchema = z.object({
  title: z.string().min(5).max(200),
  content: z.string().min(20),
  categoryId: z.string().uuid(),
  excerpt: z.string().max(500).optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  metaKeywords: z.array(z.string()).max(20).optional(),
  tags: z.array(z.string()).max(20).optional(),
});

const updateArticleSchema = createArticleSchema.partial().extend({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  changeNote: z.string().max(500).optional(),
});

const helpfulSchema = z.object({
  isHelpful: z.boolean(),
  comment: z.string().max(500).optional(),
});

// ───────────────────────────────────────────────────────────
// PUBLIC
// ───────────────────────────────────────────────────────────

@ApiTags('Knowledge Base (Public)')
@Controller('kb')
export class KbPublicController {
  constructor(private readonly kb: KbService) {}

  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Public kategori listesi' })
  categories(): Promise<unknown> {
    return this.kb.listCategories();
  }

  @Get('categories/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kategori detayı + makaleler' })
  async categoryBySlug(
    @Param('slug') slug: string,
    @Query('page') page?: string,
  ): Promise<unknown> {
    const cat = await this.kb.getCategoryBySlug(slug);
    if (!cat) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Kategori bulunamadı.');
    }
    const articles = await this.kb.listArticles({
      categorySlug: slug,
      limit: 20,
      offset: page ? (parseInt(page, 10) - 1) * 20 : 0,
    });
    return { category: cat, ...articles };
  }

  @Get('articles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yayınlanmış makaleler' })
  async articles(
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    return this.kb.listArticles({
      categorySlug: category,
      tag,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: page ? (parseInt(page, 10) - 1) * (limit ? parseInt(limit, 10) : 20) : 0,
    });
  }

  @Get('articles/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Makale detayı (view +1)' })
  async articleBySlug(@Param('slug') slug: string): Promise<unknown> {
    const article = await this.kb.getArticleBySlug(slug);
    if (!article || article.status !== 'published') {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Makale bulunamadı.');
    }
    await this.kb.incrementView(article.id);
    const related = await this.kb.getRelated(article.id, 5);
    return { article, related };
  }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Full-text search' })
  async search(
    @Query('q') q: string,
    @Query('category') category: string,
    @Query('limit') limit: string,
    @Req() req: Request,
  ): Promise<unknown> {
    if (!q) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'q parametresi zorunlu.');
    }
    const results = await this.kb.search(q, {
      limit: limit ? parseInt(limit, 10) : 10,
      categorySlug: category,
    });
    const ip = (req.headers['x-forwarded-for'] as string) ?? req.ip ?? '';
    await this.kb.logSearch(q, results.length, ip);
    return { query: q, results, count: results.length };
  }

  @Post('articles/:id/helpful')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Helpful vote' })
  async helpful(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = helpfulSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz istek.');
    }
    const voterId =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip ??
      'anonymous';
    return this.kb.voteHelpful(id, voterId, parsed.data.isHelpful, parsed.data.comment ?? null);
  }

  @Get('articles/:id/related')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'İlgili makaleler' })
  related(@Param('id') id: string): Promise<unknown> {
    return this.kb.getRelated(id);
  }

  @Get('popular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'En çok görüntülenen makaleler' })
  async popular(): Promise<unknown> {
    const r = await this.kb.listArticles({ limit: 10 });
    return {
      items: r.items.sort((a, b) => b.viewCount - a.viewCount),
    };
  }

  @Get('recent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Son eklenen makaleler' })
  async recent(): Promise<unknown> {
    const r = await this.kb.listArticles({ limit: 10 });
    return { items: r.items };
  }
}

// ───────────────────────────────────────────────────────────
// ADMIN
// ───────────────────────────────────────────────────────────

@ApiTags('Knowledge Base (Admin)')
@ApiBearerAuth()
@UseGuards()
@Controller('admin/kb')
export class KbAdminController {
  constructor(private readonly kb: KbService) {}

  // ─── CATEGORIES ───

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni kategori oluştur' })
  async createCategory(@Body() body: unknown): Promise<unknown> {
    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz kategori.');
    }
    return this.kb.createCategory(
      parsed.data.name,
      parsed.data.description ?? '',
      parsed.data.icon ?? null,
      parsed.data.orderIndex,
      parsed.data.parentId ?? null,
    );
  }

  @Patch('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kategori güncelle' })
  async updateCategory(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = updateCategorySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz kategori.');
    }
    return this.kb.updateCategory(id, parsed.data);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kategori sil' })
  async deleteCategory(@Param('id') id: string): Promise<unknown> {
    await this.kb.deleteCategory(id);
    return { ok: true };
  }

  // ─── ARTICLES ───

  @Post('articles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni makale oluştur' })
  async createArticle(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = createArticleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz makale.');
    }
    const user = (req as { user?: { email: string; fullName: string } }).user;
    return this.kb.createArticle({
      ...parsed.data,
      authorEmail: user?.email ?? 'admin@eticart.com.tr',
      authorName: user?.fullName ?? 'Super Admin',
    });
  }

  @Patch('articles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Makale güncelle' })
  async updateArticle(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = updateArticleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz makale.');
    }
    return this.kb.updateArticle(id, parsed.data);
  }

  @Delete('articles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Makale sil' })
  async deleteArticle(@Param('id') id: string): Promise<unknown> {
    await this.kb.deleteArticle(id);
    return { ok: true };
  }

  @Post('articles/:id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Makaleyi yayınla' })
  async publish(@Param('id') id: string): Promise<unknown> {
    return this.kb.updateArticle(id, { status: 'published', changeNote: 'publish' });
  }

  @Get('articles/:id/versions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Versiyon geçmişi' })
  versions(@Param('id') id: string): Promise<unknown> {
    return this.kb.getVersions(id);
  }

  // ─── STATS ───

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform istatistikleri' })
  stats(): Promise<unknown> {
    return this.kb.getStats();
  }
}