# Faz 27 — Public Knowledge Base + Search

**Tarih:** 2026-07-07
**Süre:** ~5 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Müşterilerin **self-servis** yardım alabileceği, SEO uyumlu public bilgi bankası:

- ✅ Kategori + makale CRUD
- ✅ Full-text search (PostgreSQL `tsvector` + Turkish locale)
- ✅ Helpful votes (anonymous)
- ✅ Related articles önerisi
- ✅ Versiyon geçmişi + diff
- ✅ View count + analytics
- ✅ SEO meta tags (title, description, keywords)
- ✅ Slug-based URL (SEO-friendly)
- ✅ Markdown → HTML (güvenli escape)

---

## 2. Mimari

```
┌──────────────────────────────────────────────────────────────┐
│  Public API (auth gerekmez)                                  │
│  GET   /api/kb/categories                                   │
│  GET   /api/kb/categories/:slug                             │
│  GET   /api/kb/articles                                     │
│  GET   /api/kb/articles/:slug                               │
│  GET   /api/kb/search?q=...                                 │
│  POST  /api/kb/articles/:id/helpful                         │
│  GET   /api/kb/articles/:id/related                         │
│  GET   /api/kb/popular                                      │
│  GET   /api/kb/recent                                       │
└──────────────────────────────────────────────────────────────┘
                          ↕
┌──────────────────────────────────────────────────────────────┐
│  KbService (commerce-backend)                                │
│  - listCategories, getCategoryBySlug                        │
│  - createCategory, updateCategory, deleteCategory           │
│  - listArticles (filter: category, tag, status)             │
│  - getArticleBySlug, getArticleById                         │
│  - createArticle, updateArticle, deleteArticle              │
│  - incrementView, saveVersion, getVersions                  │
│  - search (PostgreSQL ts_rank + ts_headline)               │
│  - logSearch                                                │
│  - voteHelpful                                              │
│  - getRelated (kategori + tag overlap)                      │
│  - getStats                                                 │
└──────────────────────────────────────────────────────────────┘
                          ↕ pg.Pool
┌──────────────────────────────────────────────────────────────┐
│  PostgreSQL (Turkish locale)                                 │
│  kb_categories: parent_id, slug, name, icon, order_index    │
│  kb_articles: tsvector GIN index (full-text search)         │
│  kb_article_versions: title, content, change_note           │
│  kb_helpful_votes: (article_id, voter_id) UNIQUE            │
│  kb_search_log: query, result_count, ip (analytics)         │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. DB Şeması

```sql
-- Kategoriler
CREATE TABLE public.kb_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  icon VARCHAR(50),
  order_index INT DEFAULT 0,
  parent_id UUID REFERENCES kb_categories(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Makaleler
CREATE TABLE public.kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(150) UNIQUE NOT NULL,
  category_id UUID NOT NULL REFERENCES kb_categories(id),
  title VARCHAR(200) NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  content_html TEXT NOT NULL,
  meta_title VARCHAR(70),
  meta_description VARCHAR(160),
  meta_keywords TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  author_email VARCHAR(255),
  author_name VARCHAR(200),
  view_count INT DEFAULT 0,
  helpful_yes INT DEFAULT 0,
  helpful_no INT DEFAULT 0,
  version INT DEFAULT 1,
  search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('turkish', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('turkish', coalesce(excerpt, '')), 'B') ||
      setweight(to_tsvector('turkish', coalesce(content, '')), 'C')
    ) STORED,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- GIN index (full-text search performansı)
CREATE INDEX idx_kb_articles_search
  ON public.kb_articles USING GIN (search_vector);

CREATE INDEX idx_kb_articles_status_published
  ON public.kb_articles (status, published_at DESC);

CREATE INDEX idx_kb_articles_tags
  ON public.kb_articles USING GIN (tags);

-- Versiyonlar
CREATE TABLE public.kb_article_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  version INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  author_email VARCHAR(255),
  change_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Helpful votes (anonymous)
CREATE TABLE public.kb_helpful_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  voter_id VARCHAR(255) NOT NULL,    -- IP veya cookie ID
  is_helpful BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (article_id, voter_id)      -- Aynı kişi 1 oy
);

-- Search analytics
CREATE TABLE public.kb_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query VARCHAR(200) NOT NULL,
  result_count INT NOT NULL,
  ip INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_search_log_created
  ON public.kb_search_log (created_at DESC);
```

---

## 4. Full-Text Search

### 4.1 tsvector + tsquery

```typescript
// Turkish locale ile arama
const tsQuery = query
  .toLowerCase()
  .split(/\s+/)
  .filter((t) => t.length >= 2)
  .map((t) => t.replace(/[^\w]/g, ''))
  .filter(Boolean)
  .map((t) => `${t}:*`) // Prefix match
  .join(' & ');

// "kargo takip" → "kargo:* & takip:*"
// "ödeme!" → "odeme:*" (special chars temizlenir)
```

### 4.2 SQL Query

```sql
SELECT a.*, c.slug AS category_slug, c.name AS category_name,
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
LIMIT $N
```

### 4.3 Highlight

```html
<!-- Result -->
{
  "article": {...},
  "rank": 0.85,
  "highlight": "...kargo <mark>takip</mark> numarası..."
}
```

### 4.4 Weight (A/B/C)

```
search_vector = 
  setweight(to_tsvector('turkish', title), 'A') ||
  setweight(to_tsvector('turkish', excerpt), 'B') ||
  setweight(to_tsvector('turkish', content), 'C');

A = title (en yüksek öncelik)
B = excerpt (orta)
C = content (en düşük)
```

---

## 5. SEO Optimizasyonu

### 5.1 Slug Generation

```typescript
slugify('Kargo ve Teslimat')
// → 'kargo-ve-teslimat'

slugify('Satın Alma Rehberi')
// → 'satin-alma-rehberi' (Türkçe karakter dönüşümü)

// URL: /kb/kargo-ve-teslimat
```

### 5.2 Meta Tags

```typescript
{
  metaTitle: 'Kargo ve Teslimat | EtiCart Help Center',
  metaDescription: 'Kargonuzun takibi, teslimat süreleri ve sorun çözümü. EtiCart Help Center\'da tüm sorularınızın yanıtı.',
  metaKeywords: ['kargo', 'teslimat', 'takip', 'eticart'],
  tags: ['shipping', 'logistics', 'tracking'],
}
```

### 5.3 JSON-LD (gelecek Sprint)

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Kargo ve Teslimat",
  "description": "...",
  "author": {
    "@type": "Organization",
    "name": "EtiCart Help Center"
  },
  "datePublished": "2026-07-07T...",
  "dateModified": "2026-07-07T...",
  "interactionStatistic": {
    "@type": "InteractionCounter",
    "interactionType": "https://schema.org/LikeAction",
    "userInteractionCount": 120
  }
}
```

---

## 6. Markdown → HTML

Basit ama güvenli (XSS koruması):

```typescript
markdownToHtml('# Başlık\n\nİçerik')
// → '<h1>Başlık</h1><p>İçerik</p>'

markdownToHtml('**bold** *italic* `code`')
// → '<p><strong>bold</strong> <em>italic</em> <code>code</code></p>'

markdownToHtml('- item 1\n- item 2')
// → '<ul><li>item 1</li><li>item 2</li></ul>'

markdownToHtml('<script>alert(1)</script>')
// → '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'  // XSS koruması
```

**Güvenlik:**
- HTML escape önce (XSS)
- Sadece izinli tag'ler: `<h1>`, `<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>`, `<strong>`, `<em>`, `<code>`, `<a>`
- `<script>` ve diğer tehlikeli tag'ler otomatik escape

---

## 7. Versiyon Geçmişi

Her update'te eski içerik `kb_article_versions`'a kaydedilir:

```sql
INSERT INTO kb_article_versions (article_id, version, title, content, author_email, change_note)
VALUES (article_id, new_version, title, content, author, 'published with new tags');
```

**Endpoint:** `GET /api/admin/kb/articles/:id/versions` → Tüm versiyonlar (DESC).

**Rollback:** Manuel SQL ile (admin UI Faz 27.5).

---

## 8. Helpful Votes

```typescript
// Anonymous voter_id (cookie veya IP)
const voterId = req.ip ?? 'anonymous';

await kbService.voteHelpful(articleId, voterId, isHelpful, comment);
```

**Upsert (UNIQUE constraint):**
- Aynı voter_id aynı article'a tekrar oy verirse → update
- `kb_articles.helpful_yes/no` counters otomatik güncellenir

---

## 9. Related Articles

```sql
SELECT a.*
FROM kb_articles a
WHERE a.id != $1
  AND a.status = 'published'
  AND (
    a.category_id = (SELECT category_id FROM kb_articles WHERE id = $1)
    OR a.tags && (SELECT tags FROM kb_articles WHERE id = $1)
  )
ORDER BY
  (CASE WHEN a.category_id = ... THEN 0 ELSE 1 END),
  a.view_count DESC
LIMIT 5
```

**Sıralama:**
1. Aynı kategorideki makaleler önce
2. Sonra tag overlap olanlar
3. View count'a göre DESC

---

## 10. Stats Endpoint (Admin)

```typescript
{
  totalArticles: 100,
  publishedArticles: 85,
  totalCategories: 12,
  totalViews: 15_000,
  totalHelpfulYes: 240,
  totalHelpfulNo: 60,
  helpfulRatio: 0.80,  // 80%
  topArticles: [
    { id: '...', title: 'Kargo Takip', slug: 'kargo-takip', viewCount: 5000 },
    ...
  ],
  topSearches: [
    { query: 'kargo takip', count: 120 },
    { query: 'ödeme iade', count: 95 },
    ...
  ],
}
```

---

## 11. API Endpoint'leri

### Public

```http
GET /api/kb/categories
  → [{ slug, name, description, icon, articleCount }]

GET /api/kb/categories/:slug?page=1
  → { category: {...}, items: [...], total }

GET /api/kb/articles?category=shipping&tag=kargo&page=1
  → { items: [...], total }

GET /api/kb/articles/:slug
  → { article: {...}, related: [...] } (view_count++)

GET /api/kb/search?q=kargo+takip&category=shipping&limit=10
  → { query, results: [{ article, rank, highlight }], count }

POST /api/kb/articles/:id/helpful
  Body: { isHelpful: true, comment: 'Çok faydalı' }
  → { id, isHelpful, ... }

GET /api/kb/articles/:id/related
  → [{ id, title, slug, ... }]

GET /api/kb/popular
  → { items: [...] } (view_count DESC)

GET /api/kb/recent
  → { items: [...] } (published_at DESC)
```

### Admin

```http
POST /api/admin/kb/categories
  Body: { name, description, icon, orderIndex, parentId }
  → { id, slug, ... }

PATCH /api/admin/kb/categories/:id
DELETE /api/admin/kb/categories/:id

POST /api/admin/kb/articles
  Body: { title, content, categoryId, excerpt?, metaTitle?, metaDescription?, tags? }
  → { id, slug, contentHtml, version: 1, ... }

PATCH /api/admin/kb/articles/:id
  Body: { title?, content?, status?, changeNote?, ... }
  → { ..., version: 2 }

DELETE /api/admin/kb/articles/:id
POST /api/admin/kb/articles/:id/publish

GET /api/admin/kb/articles/:id/versions
  → [{ version, title, content, authorEmail, changeNote, createdAt }]

GET /api/admin/kb/stats
  → { totalArticles, totalViews, helpfulRatio, topArticles, topSearches, ... }
```

---

## 12. Test Sonuçları

### Yeni Testler (36)

| Test Grubu | Sayı | Sonuç |
|------------|------|-------|
| **Categories** (list, getBySlug, create, update, delete) | 6 | ✅ |
| **Articles** (list filter, getBySlug, create+excerpt, update+version, incrementView) | 11 | ✅ |
| **Full-text Search** (tsquery format, special chars, category filter, rank DESC) | 7 | ✅ |
| **Helpful Votes** (upsert, counters update) | 2 | ✅ |
| **Related Articles** (kategori + tag overlap) | 1 | ✅ |
| **Stats** (toplam, helpfulRatio, top articles/searches) | 2 | ✅ |
| **Slugify** (Türkçe karakter dönüşümü) | 1 | ✅ |
| **Markdown → HTML** (başlık, bold/italic/code, liste, HTML escape) | 4 | ✅ |
| **Search Log** (kısa skip, insert) | 2 | ✅ |

### Tüm Proje Test Özeti

| Paket | Test | Sonuç |
|-------|------|-------|
| **commerce-backend** | **282** | ✅ (+36) |
| control-plane | 90 | ✅ |
| storefront | 59 | ✅ |
| plugin-sdk | 61 | ✅ |
| ai | 47 | ✅ |
| region-router | 64 | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **775+** ✅ | **+36 yeni** |

---

## 13. Dosya Yapısı

```
apps/commerce-backend/src/modules/kb/                # 🆕
├── kb.types.ts                                      # 2 KB — type defs
├── kb.service.ts                                    # 19 KB — CRUD + search
├── kb.controller.ts                                 # 10.4 KB — public + admin
├── kb.module.ts
└── __tests__/kb.service.test.ts                     # 36 test
```

---

## 14. Production Checklist

- [x] Categories + Articles CRUD
- [x] PostgreSQL tsvector + Turkish locale
- [x] GIN index for search performance
- [x] ts_headline snippet generation
- [x] Slug-based URL (Türkçe karakter dönüşümü)
- [x] Markdown → HTML (güvenli escape)
- [x] SEO meta tags (title, description, keywords)
- [x] Versiyon geçmişi (her update)
- [x] Helpful votes (anonymous, upsert)
- [x] View count increment
- [x] Related articles (kategori + tag overlap)
- [x] Search log (analytics)
- [x] Top articles + top searches
- [x] Stats endpoint (admin)
- [x] Public + Admin API
- [ ] Admin KB UI (CRUD + reorder) — Faz 27.5
- [ ] Public KB UI (help center pages) — Faz 27.5
- [ ] JSON-LD structured data — Faz 27.5
- [ ] Email subscription (new article notification) — Faz 27.5
- [ ] Article feedback widget (was helpful?) — Faz 27.5
- [ ] AI auto-suggest tags/categories (Faz 25 entegrasyonu) — Faz 27.5
- [ ] RAG ile LLM destekli arama — Faz 27.5

---

## 15. Sprint 28+ Önerileri

| Sprint | İçerik | Süre | Öncelik |
|--------|--------|------|---------|
| **27.5** | Admin KB UI + Public KB pages + RAG | 5 gün | 🟢 |
| **28** | Plugin auto-update notification | 3 gün | 🟡 |
| **29** | Tenant analytics + churn prediction | 5 gün | 🟡 |
| **30** | Marketplace daha fazla adaptör (Gittigidiyor, Amazon TR) | 3 gün | 🟢 |

---

*Son güncelleme: 2026-07-07 — Faz 27 Public KB + Search*
*Toplam: 27 Faz, 775+ test*