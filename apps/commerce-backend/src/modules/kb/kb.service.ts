/**
 * KB Service — Knowledge Base CRUD + Full-text search.
 *
 * PostgreSQL tsvector + GIN index ile arama.
 * SEO uyumlu slug + meta tags.
 * Helpful votes, view count, related articles.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';

import { LOGGER_TOKEN } from '../../common/logger.js';
import type {
  KbCategory,
  KbArticle,
  KbArticleVersion,
  KbSearchResult,
  KbHelpfulVote,
  KbStats,
  ArticleStatus,
} from './kb.types.js';

const SLUG_TR_REGEX = /[^a-z0-9]+/g;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(SLUG_TR_REGEX, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/**
 * Basit markdown → HTML (güvenli escape, sadece temel syntax).
 */
function markdownToHtml(md: string): string {
  let html = md;
  // HTML escape önce
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Başlıklar
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold + Italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Code
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  // Link
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  // Liste
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.+<\/li>\n?)+/g, '<ul>$&</ul>');
  // Paragraf
  html = html
    .split(/\n\n+/)
    .map((p) => (p.match(/^<(h\d|ul|li)/) ? p : `<p>${p}</p>`))
    .join('\n');
  return html;
}

@Injectable()
export class KbService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // CATEGORIES
  // ─────────────────────────────────────────────────────────────

  async listCategories(): Promise<KbCategory[]> {
    const r = await this.pool.query<KbCategory>(
      `SELECT c.*, COUNT(a.id)::int AS article_count
       FROM public.kb_categories c
       LEFT JOIN public.kb_articles a
         ON a.category_id = c.id AND a.status = 'published'
       WHERE c.parent_id IS NULL
       GROUP BY c.id
       ORDER BY c.order_index ASC, c.name ASC`,
    );
    return r.rows.map((row) => ({
      ...row,
      articleCount: (row as unknown as { article_count: number }).article_count ?? 0,
    }));
  }

  async getCategoryBySlug(slug: string): Promise<KbCategory | null> {
    const r = await this.pool.query<KbCategory>(
      `SELECT c.*, COUNT(a.id)::int AS article_count
       FROM public.kb_categories c
       LEFT JOIN public.kb_articles a
         ON a.category_id = c.id AND a.status = 'published'
       WHERE c.slug = $1
       GROUP BY c.id`,
      [slug],
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0]!;
    return {
      ...row,
      articleCount: (row as unknown as { article_count: number }).article_count ?? 0,
    };
  }

  async createCategory(
    name: string,
    description: string,
    icon: string | null,
    orderIndex: number,
    parentId: string | null,
  ): Promise<KbCategory> {
    const slug = slugify(name);
    const r = await this.pool.query<KbCategory>(
      `INSERT INTO public.kb_categories (
         slug, name, description, icon, order_index, parent_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [slug, name, description, icon, orderIndex, parentId],
    );
    return { ...r.rows[0]!, articleCount: 0 };
  }

  async updateCategory(
    id: string,
    updates: { name?: string; description?: string; icon?: string | null; orderIndex?: number },
  ): Promise<KbCategory> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (updates.name !== undefined) {
      sets.push(`name = $${i++}`);
      params.push(updates.name);
      sets.push(`slug = $${i++}`);
      params.push(slugify(updates.name));
    }
    if (updates.description !== undefined) {
      sets.push(`description = $${i++}`);
      params.push(updates.description);
    }
    if (updates.icon !== undefined) {
      sets.push(`icon = $${i++}`);
      params.push(updates.icon);
    }
    if (updates.orderIndex !== undefined) {
      sets.push(`order_index = $${i++}`);
      params.push(updates.orderIndex);
    }
    sets.push(`updated_at = now()`);
    params.push(id);
    const r = await this.pool.query<KbCategory>(
      `UPDATE public.kb_categories SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      params,
    );
    if (r.rows.length === 0) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Kategori bulunamadı.');
    }
    return { ...r.rows[0]!, articleCount: 0 };
  }

  async deleteCategory(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM public.kb_categories WHERE id = $1`, [id]);
  }

  // ─────────────────────────────────────────────────────────────
  // ARTICLES
  // ─────────────────────────────────────────────────────────────

  async listArticles(
    options: {
      categoryId?: string;
      categorySlug?: string;
      status?: ArticleStatus;
      limit?: number;
      offset?: number;
      tag?: string;
    },
  ): Promise<{ items: KbArticle[]; total: number }> {
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    let i = 1;
    if (options.categoryId) {
      where.push(`a.category_id = $${i++}`);
      params.push(options.categoryId);
    } else if (options.categorySlug) {
      where.push(`c.slug = $${i++}`);
      params.push(options.categorySlug);
    }
    if (options.status) {
      where.push(`a.status = $${i++}`);
      params.push(options.status);
    } else {
      where.push(`a.status = 'published'`);
    }
    if (options.tag) {
      where.push(`$${i++} = ANY(a.tags)`);
      params.push(options.tag);
    }
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    params.push(limit, offset);

    const r = await this.pool.query<KbArticle>(
      `SELECT a.*, c.slug AS category_slug, c.name AS category_name
       FROM public.kb_articles a
       INNER JOIN public.kb_categories c ON c.id = a.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      params,
    );
    const totalR = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM public.kb_articles a
       INNER JOIN public.kb_categories c ON c.id = a.category_id
       WHERE ${where.slice(0, -2).join(' AND ')}`,
      params.slice(0, -2),
    );
    return {
      items: r.rows,
      total: parseInt(totalR.rows[0]?.count ?? '0', 10),
    };
  }

  async getArticleBySlug(slug: string): Promise<KbArticle | null> {
    const r = await this.pool.query<KbArticle>(
      `SELECT a.*, c.slug AS category_slug, c.name AS category_name
       FROM public.kb_articles a
       INNER JOIN public.kb_categories c ON c.id = a.category_id
       WHERE a.slug = $1`,
      [slug],
    );
    return r.rows[0] ?? null;
  }

  async getArticleById(id: string): Promise<KbArticle | null> {
    const r = await this.pool.query<KbArticle>(
      `SELECT a.*, c.slug AS category_slug, c.name AS category_name
       FROM public.kb_articles a
       INNER JOIN public.kb_categories c ON c.id = a.category_id
       WHERE a.id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  }

  async createArticle(
    input: {
      title: string;
      content: string;
      categoryId: string;
      excerpt?: string;
      metaTitle?: string;
      metaDescription?: string;
      metaKeywords?: string[];
      tags?: string[];
      authorEmail: string;
      authorName: string;
    },
  ): Promise<KbArticle> {
    const slug = slugify(input.title);
    const contentHtml = markdownToHtml(input.content);
    const excerpt = input.excerpt ?? input.content.slice(0, 200);

    const r = await this.pool.query<KbArticle>(
      `INSERT INTO public.kb_articles (
         slug, category_id, title, excerpt, content, content_html,
         meta_title, meta_description, meta_keywords, tags,
         status, author_email, author_name, version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, $12, 1
       )
       RETURNING *`,
      [
        slug,
        input.categoryId,
        input.title,
        excerpt,
        input.content,
        contentHtml,
        input.metaTitle ?? null,
        input.metaDescription ?? null,
        input.metaKeywords ?? [],
        input.tags ?? [],
        input.authorEmail,
        input.authorName,
      ],
    );
    const article = r.rows[0]!;
    // İlk versiyonu kaydet
    await this.saveVersion(article.id, article);
    return article;
  }

  async updateArticle(
    id: string,
    updates: {
      title?: string;
      content?: string;
      excerpt?: string;
      metaTitle?: string;
      metaDescription?: string;
      metaKeywords?: string[];
      tags?: string[];
      status?: ArticleStatus;
      changeNote?: string;
    },
  ): Promise<KbArticle> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (updates.title !== undefined) {
      sets.push(`title = $${i++}`);
      params.push(updates.title);
      sets.push(`slug = $${i++}`);
      params.push(slugify(updates.title));
    }
    if (updates.content !== undefined) {
      sets.push(`content = $${i++}`);
      params.push(updates.content);
      sets.push(`content_html = $${i++}`);
      params.push(markdownToHtml(updates.content));
    }
    if (updates.excerpt !== undefined) {
      sets.push(`excerpt = $${i++}`);
      params.push(updates.excerpt);
    }
    if (updates.metaTitle !== undefined) {
      sets.push(`meta_title = $${i++}`);
      params.push(updates.metaTitle);
    }
    if (updates.metaDescription !== undefined) {
      sets.push(`meta_description = $${i++}`);
      params.push(updates.metaDescription);
    }
    if (updates.metaKeywords !== undefined) {
      sets.push(`meta_keywords = $${i++}`);
      params.push(updates.metaKeywords);
    }
    if (updates.tags !== undefined) {
      sets.push(`tags = $${i++}`);
      params.push(updates.tags);
    }
    if (updates.status !== undefined) {
      sets.push(`status = $${i++}`);
      params.push(updates.status);
      if (updates.status === 'published') {
        sets.push(`published_at = COALESCE(published_at, now())`);
      }
    }
    sets.push(`version = version + 1`);
    sets.push(`updated_at = now()`);
    params.push(id);

    const r = await this.pool.query<KbArticle>(
      `UPDATE public.kb_articles SET ${sets.join(', ')}
       WHERE id = $${i} RETURNING *`,
      params,
    );
    if (r.rows.length === 0) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Makale bulunamadı.');
    }
    const article = r.rows[0]!;
    await this.saveVersion(article.id, article, updates.changeNote);
    return article;
  }

  async deleteArticle(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM public.kb_articles WHERE id = $1`, [id]);
  }

  async incrementView(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.kb_articles SET view_count = view_count + 1 WHERE id = $1`,
      [id],
    );
  }

  private async saveVersion(
    articleId: string,
    article: KbArticle,
    changeNote = 'initial version',
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.kb_article_versions (
         article_id, version, title, content, author_email, change_note
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        articleId,
        article.version,
        article.title,
        article.content,
        article.authorEmail,
        changeNote,
      ],
    );
  }

  async getVersions(articleId: string): Promise<KbArticleVersion[]> {
    const r = await this.pool.query<KbArticleVersion>(
      `SELECT * FROM public.kb_article_versions
       WHERE article_id = $1
       ORDER BY version DESC`,
      [articleId],
    );
    return r.rows;
  }

  // ─────────────────────────────────────────────────────────────
  // FULL-TEXT SEARCH
  // ─────────────────────────────────────────────────────────────

  async search(
    query: string,
    options: { limit?: number; categorySlug?: string } = {},
  ): Promise<KbSearchResult[]> {
    if (!query || query.trim().length < 2) return [];

    const limit = options.limit ?? 10;
    const tsQuery = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .map((t) => t.replace(/[^\w]/g, ''))
      .filter(Boolean)
      .map((t) => `${t}:*`)
      .join(' & ');

    if (!tsQuery) return [];

    const params: unknown[] = [tsQuery];
    let categoryFilter = '';
    if (options.categorySlug) {
      categoryFilter = `AND c.slug = $${params.length + 1}`;
      params.push(options.categorySlug);
    }
    params.push(limit);

    const r = await this.pool.query<KbArticle & { rank: number; highlight: string }>(
      `SELECT a.*, c.slug AS category_slug, c.name AS category_name,
              ts_rank(a.search_vector, to_tsquery('turkish', $1)) AS rank,
              ts_headline(
                'turkish',
                a.content,
                to_tsquery('turkish', $1),
                'StartSel=<mark>, StopSel=</mark>, MaxWords=20, MinWords=10'
              ) AS highlight
       FROM public.kb_articles a
       INNER JOIN public.kb_categories c ON c.id = a.category_id
       WHERE a.search_vector @@ to_tsquery('turkish', $1)
         AND a.status = 'published'
         ${categoryFilter}
       ORDER BY rank DESC, a.view_count DESC
       LIMIT $${params.length}`,
      params,
    );

    return r.rows.map((row) => ({
      article: row,
      rank: parseFloat(String(row.rank)) || 0,
      highlight: row.highlight ?? row.excerpt,
    }));
  }

  async logSearch(query: string, results: number, ip: string): Promise<void> {
    if (!query || query.length < 2) return;
    await this.pool.query(
      `INSERT INTO public.kb_search_log (query, result_count, ip, created_at)
       VALUES ($1, $2, $3, now())`,
      [query.slice(0, 200), results, ip || null],
    );
  }

  // ─────────────────────────────────────────────────────────────
  // HELPFUL VOTES
  // ─────────────────────────────────────────────────────────────

  async voteHelpful(
    articleId: string,
    voterId: string,
    isHelpful: boolean,
    comment: string | null,
  ): Promise<KbHelpfulVote> {
    // Upsert: aynı voter aynı article'a tekrar oy verirse güncelle
    const r = await this.pool.query<KbHelpfulVote>(
      `INSERT INTO public.kb_helpful_votes (article_id, voter_id, is_helpful, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (article_id, voter_id)
       DO UPDATE SET is_helpful = EXCLUDED.is_helpful,
                     comment = EXCLUDED.comment,
                     created_at = now()
       RETURNING *`,
      [articleId, voterId, isHelpful, comment],
    );

    // Article'ın toplam sayılarını güncelle
    await this.pool.query(
      `UPDATE public.kb_articles a
       SET helpful_yes = (SELECT COUNT(*) FROM public.kb_helpful_votes
                          WHERE article_id = a.id AND is_helpful = true),
           helpful_no = (SELECT COUNT(*) FROM public.kb_helpful_votes
                         WHERE article_id = a.id AND is_helpful = false)
       WHERE a.id = $1`,
      [articleId],
    );
    return r.rows[0]!;
  }

  // ─────────────────────────────────────────────────────────────
  // RELATED ARTICLES
  // ─────────────────────────────────────────────────────────────

  async getRelated(articleId: string, limit = 5): Promise<KbArticle[]> {
    // Aynı kategori + tag overlap
    const r = await this.pool.query<KbArticle>(
      `SELECT a.*, c.slug AS category_slug, c.name AS category_name
       FROM public.kb_articles a
       INNER JOIN public.kb_categories c ON c.id = a.category_id
       WHERE a.id != $1
         AND a.status = 'published'
         AND (
           a.category_id = (SELECT category_id FROM public.kb_articles WHERE id = $1)
           OR a.tags && (SELECT tags FROM public.kb_articles WHERE id = $1)
         )
       ORDER BY
         (CASE WHEN a.category_id = (SELECT category_id FROM public.kb_articles WHERE id = $1) THEN 0 ELSE 1 END),
         a.view_count DESC
       LIMIT $2`,
      [articleId, limit],
    );
    return r.rows;
  }

  // ─────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────

  async getStats(): Promise<KbStats> {
    const [articleStats, helpfulStats, topArticles, topSearches] = await Promise.all([
      this.pool.query<{ total: string; published: string; views: string }>(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'published') AS published,
                COALESCE(SUM(view_count), 0) AS views
         FROM public.kb_articles`,
      ),
      this.pool.query<{ yes: string; no: string }>(
        `SELECT
           COALESCE(SUM(CASE WHEN is_helpful THEN 1 ELSE 0 END), 0) AS yes,
           COALESCE(SUM(CASE WHEN NOT is_helpful THEN 1 ELSE 0 END), 0) AS no
         FROM public.kb_helpful_votes`,
      ),
      this.pool.query<{ id: string; title: string; slug: string; view_count: number }>(
        `SELECT id, title, slug, view_count
         FROM public.kb_articles
         WHERE status = 'published'
         ORDER BY view_count DESC
         LIMIT 10`,
      ),
      this.pool.query<{ query: string; count: string }>(
        `SELECT query, COUNT(*) AS count
         FROM public.kb_search_log
         WHERE created_at > now() - interval '30 days'
         GROUP BY query
         ORDER BY count DESC
         LIMIT 10`,
      ),
    ]);

    const totalCategories = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM public.kb_categories`,
    );

    const yes = parseInt(helpfulStats.rows[0]?.yes ?? '0', 10);
    const no = parseInt(helpfulStats.rows[0]?.no ?? '0', 10);
    const total = yes + no;
    return {
      totalArticles: parseInt(articleStats.rows[0]?.total ?? '0', 10),
      publishedArticles: parseInt(articleStats.rows[0]?.published ?? '0', 10),
      totalCategories: parseInt(totalCategories.rows[0]?.count ?? '0', 10),
      totalViews: parseInt(articleStats.rows[0]?.views ?? '0', 10),
      totalHelpfulYes: yes,
      totalHelpfulNo: no,
      helpfulRatio: total > 0 ? yes / total : 0,
      topArticles: topArticles.rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        viewCount: row.view_count,
      })),
      topSearches: topSearches.rows.map((row) => ({
        query: row.query,
        count: parseInt(row.count, 10),
      })),
    };
  }
}