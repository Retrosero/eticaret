/**
 * KB Service — unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@eticart/config';
import { KbService } from '../kb.service.js';

const mockPool: any = {
  query: vi.fn(),
};
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

/** Mock pg query çağrısının values parametresini döner. */
function getCallValues(callIndex: number): unknown[] {
  const calls = mockPool.query.mock.calls;
  if (!calls[callIndex]) return [];
  const args = calls[callIndex];
  return (args[1] as unknown[] | undefined) ?? [];
}

describe('KbService', () => {
  let service: KbService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockReset();
    service = new KbService(mockLogger, mockPool);
  });

  describe('Categories', () => {
    it('listCategories parent=null', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', slug: 'getting-started', name: 'Başlangıç', article_count: 3 }],
      });
      const cats = await service.listCategories();
      expect(cats).toHaveLength(1);
      expect(cats[0]?.articleCount).toBe(3);
    });

    it('getCategoryBySlug mevcut', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', slug: 'shipping', name: 'Kargo', article_count: 5 }],
      });
      const c = await service.getCategoryBySlug('shipping');
      expect(c?.slug).toBe('shipping');
    });

    it('getCategoryBySlug yok → null', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const c = await service.getCategoryBySlug('nonexistent');
      expect(c).toBeNull();
    });

    it('createCategory slugify', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-new', slug: 'kargo-ve-teslimat', name: 'Kargo ve Teslimat' }],
      });
      const c = await service.createCategory('Kargo ve Teslimat', 'Açıklama', 'truck', 1, null);
      expect(c.slug).toBe('kargo-ve-teslimat');
      const values = getCallValues(0);
      expect(values[0]).toBe('kargo-ve-teslimat');
    });

    it('updateCategory partial fields', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'c-1', name: 'Yeni' }] });
      await service.updateCategory('c-1', { name: 'Yeni' });
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain('name');
      expect(sql).toContain('slug');
    });

    it('deleteCategory', async () => {
      mockPool.query.mockResolvedValueOnce({});
      await service.deleteCategory('c-1');
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain('DELETE');
    });
  });

  describe('Articles', () => {
    it('listArticles default published', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'a-1', status: 'published' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });
      const r = await service.listArticles({});
      expect(r.items).toHaveLength(1);
      expect(r.total).toBe(5);
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain("status = 'published'");
    });

    it('listArticles categoryId filtresi', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await service.listArticles({ categoryId: 'c-1' });
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain('a.category_id');
    });

    it('listArticles tag filtresi', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await service.listArticles({ tag: 'shipping' });
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain('ANY(a.tags)');
    });

    it('getArticleBySlug', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'a-1', slug: 'kargo-takip', title: 'Kargo Takip' }],
      });
      const a = await service.getArticleBySlug('kargo-takip');
      expect(a?.title).toBe('Kargo Takip');
    });

    it('createArticle slug + html + version', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'a-new',
            slug: 'test-makale',
            title: 'Test Makale',
            content: '# Başlık\n\nİçerik',
            content_html: '<h1>Başlık</h1><p>İçerik</p>',
            version: 1,
          }],
        })
        .mockResolvedValueOnce({});
      const a = await service.createArticle({
        title: 'Test Makale',
        content: '# Başlık\n\nİçerik',
        categoryId: 'c-1',
        authorEmail: 'admin@eticart.com.tr',
        authorName: 'Admin',
      });
      expect(a.slug).toBe('test-makale');
      // contentHtml row'da snake_case (db) olarak geliyor
      expect((a as { content_html?: string }).content_html).toContain('<h1>');
    });

    it('createArticle excerpt auto', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'a-new',
            content: 'a'.repeat(500),
            content_html: 'a'.repeat(500),
          }],
        })
        .mockResolvedValueOnce({});
      await service.createArticle({
        title: 'X',
        content: 'a'.repeat(500),
        categoryId: 'c-1',
        authorEmail: 'a@a.com',
        authorName: 'A',
      });
      const values = getCallValues(0);
      expect((values[3] as string).length).toBeLessThanOrEqual(200);
    });

    it('updateArticle status=published → published_at set', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'a-1', status: 'published', version: 2 }],
        })
        .mockResolvedValueOnce({});
      await service.updateArticle('a-1', { status: 'published' });
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain('published_at = COALESCE');
    });

    it('updateArticle version increment', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'a-1', version: 5 }] })
        .mockResolvedValueOnce({});
      await service.updateArticle('a-1', { title: 'Yeni' });
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain('version + 1');
    });

    it('updateArticle bulunamadı → 404', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.updateArticle('a-x', { title: 'X' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('incrementView', async () => {
      mockPool.query.mockResolvedValueOnce({});
      await service.incrementView('a-1');
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain('view_count + 1');
    });

    it('deleteArticle', async () => {
      mockPool.query.mockResolvedValueOnce({});
      await service.deleteArticle('a-1');
    });

    it('getVersions DESC', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { version: 3, change_note: 'v3' },
          { version: 2, change_note: 'v2' },
          { version: 1, change_note: 'v1' },
        ],
      });
      const versions = await service.getVersions('a-1');
      expect(versions[0]?.version).toBe(3);
    });
  });

  describe('Full-text search', () => {
    it('kısa query → boş sonuç', async () => {
      const r = await service.search('a');
      expect(r).toEqual([]);
    });

    it('boş query → boş sonuç', async () => {
      const r = await service.search('');
      expect(r).toEqual([]);
    });

    it('tsquery formatı oluştur', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await service.search('kargo takip');
      const values = getCallValues(0);
      expect(values[0]).toBe('kargo:* & takip:*');
    });

    it('special chars temizlenir', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await service.search('ödeme!');
      const values = getCallValues(0);
      expect((values[0] as string)).not.toContain('!');
    });

    it('category slug filter', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await service.search('test', { categorySlug: 'billing' });
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain('c.slug =');
    });

    it('sonuçlar rank DESC', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'a-1', rank: 0.8, highlight: '...<mark>kargo</mark>...' },
          { id: 'a-2', rank: 0.5, highlight: '...kargo...' },
        ],
      });
      const r = await service.search('kargo');
      expect(r).toHaveLength(2);
      expect(r[0]?.article.id).toBe('a-1');
      expect(r[0]?.rank).toBe(0.8);
    });

    it('logSearch kısa query skip', async () => {
      await service.logSearch('a', 0, '127.0.0.1');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('logSearch insert', async () => {
      mockPool.query.mockResolvedValueOnce({});
      await service.logSearch('kargo takip', 5, '127.0.0.1');
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain('INSERT INTO public.kb_search_log');
    });
  });

  describe('Helpful votes', () => {
    it('voteHelpful upsert', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'v-1',
            article_id: 'a-1',
            voter_id: '127.0.0.1',
            is_helpful: true,
            comment: null,
            created_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({});
      const v = await service.voteHelpful('a-1', '127.0.0.1', true, null);
      // Row snake_case döner (db)
      expect((v as { is_helpful?: boolean }).is_helpful).toBe(true);
    });

    it('voteHelpful counters update', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'v-1', is_helpful: true }],
        })
        .mockResolvedValueOnce({});
      await service.voteHelpful('a-1', 'voter-1', true, null);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('Related articles', () => {
    it('related kategori + tag overlap', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'a-2', title: 'İlgili' }] });
      const r = await service.getRelated('a-1');
      expect(r).toHaveLength(1);
      const sql = mockPool.query.mock.calls[0]![0];
      expect(sql).toContain('a.category_id');
      expect(sql).toContain('a.tags');
    });
  });

  describe('Stats', () => {
    it('toplam + helpfulRatio', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '100', published: '85', views: '5000' }] })
        .mockResolvedValueOnce({ rows: [{ yes: '120', no: '30' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'a-1', title: 'X', slug: 'x', view_count: 100 }] })
        .mockResolvedValueOnce({ rows: [{ query: 'kargo', count: '50' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });
      const stats = await service.getStats();
      expect(stats.totalArticles).toBe(100);
      expect(stats.publishedArticles).toBe(85);
      expect(stats.totalHelpfulYes).toBe(120);
      expect(stats.totalHelpfulNo).toBe(30);
      expect(stats.helpfulRatio).toBeCloseTo(120 / 150);
      expect(stats.topArticles).toHaveLength(1);
      expect(stats.topSearches).toHaveLength(1);
    });

    it('helpfulRatio sıfır (no votes)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '0', published: '0', views: '0' }] })
        .mockResolvedValueOnce({ rows: [{ yes: '0', no: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const stats = await service.getStats();
      expect(stats.helpfulRatio).toBe(0);
    });
  });
});

describe('slugify (private)', () => {
  it('Türkçe karakter dönüşümü', async () => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'c-new', slug: 'satin-alma-rehberi' }],
    });
    const svc = new KbService(mockLogger, mockPool);
    await svc.createCategory('Satın Alma Rehberi', '', null, 0, null);
    const values = getCallValues(0);
    expect(values[0]).toBe('satin-alma-rehberi');
  });
});

describe('markdownToHtml (private)', () => {
  it('başlık dönüşümü', async () => {
    mockPool.query.mockReset();
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'a-1', content_html: '<h1>Başlık</h1><p>İçerik</p>' }],
      })
      .mockResolvedValueOnce({});
    const svc = new KbService(mockLogger, mockPool);
    await svc.createArticle({
      title: 'Test',
      content: '# Başlık\n\nİçerik',
      categoryId: 'c-1',
      authorEmail: 'a@a.com',
      authorName: 'A',
    });
    const values = getCallValues(0);
    expect(values[5]).toContain('<h1>');
    expect(values[5]).toContain('<p>');
  });

  it('bold + italic + code', async () => {
    mockPool.query.mockReset();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'a-1', content_html: '' }] })
      .mockResolvedValueOnce({});
    const svc = new KbService(mockLogger, mockPool);
    await svc.createArticle({
      title: 'T',
      content: '**bold** *italic* `code`',
      categoryId: 'c-1',
      authorEmail: 'a@a.com',
      authorName: 'A',
    });
    const values = getCallValues(0);
    expect(values[5]).toContain('<strong>bold</strong>');
    expect(values[5]).toContain('<em>italic</em>');
    expect(values[5]).toContain('<code>code</code>');
  });

  it('liste', async () => {
    mockPool.query.mockReset();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'a-1', content_html: '' }] })
      .mockResolvedValueOnce({});
    const svc = new KbService(mockLogger, mockPool);
    await svc.createArticle({
      title: 'T',
      content: '- item 1\n- item 2',
      categoryId: 'c-1',
      authorEmail: 'a@a.com',
      authorName: 'A',
    });
    const values = getCallValues(0);
    expect(values[5]).toContain('<ul>');
    expect(values[5]).toContain('<li>item 1</li>');
  });

  it('HTML escape', async () => {
    mockPool.query.mockReset();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'a-1', content_html: '' }] })
      .mockResolvedValueOnce({});
    const svc = new KbService(mockLogger, mockPool);
    await svc.createArticle({
      title: 'T',
      content: '<script>alert(1)</script>',
      categoryId: 'c-1',
      authorEmail: 'a@a.com',
      authorName: 'A',
    });
    const values = getCallValues(0);
    expect(values[5]).not.toContain('<script>');
    expect(values[5]).toContain('&lt;script&gt;');
  });
});