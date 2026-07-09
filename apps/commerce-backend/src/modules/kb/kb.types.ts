/**
 * KB Types — Knowledge Base entity definitions.
 */

export type ArticleStatus = 'draft' | 'published' | 'archived';

export interface KbCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  orderIndex: number;
  parentId: string | null;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KbArticle {
  id: string;
  slug: string;
  categoryId: string;
  title: string;
  excerpt: string;
  content: string;
  contentHtml: string;
  /** SEO meta */
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[];
  /** Tags */
  tags: string[];
  /** Status */
  status: ArticleStatus;
  /** Author (super admin email) */
  authorEmail: string;
  authorName: string;
  /** Stats */
  viewCount: number;
  helpfulYes: number;
  helpfulNo: number;
  /** Search vector (PostgreSQL tsvector) */
  searchVector?: string;
  /** Version */
  version: number;
  /** Timestamps */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KbArticleVersion {
  id: string;
  articleId: string;
  version: number;
  title: string;
  content: string;
  authorEmail: string;
  changeNote: string;
  createdAt: string;
}

export interface KbSearchResult {
  article: KbArticle;
  /** Search relevance score (0-1) */
  rank: number;
  /** Highlighted snippet */
  highlight: string;
}

export interface KbHelpfulVote {
  id: string;
  articleId: string;
  /** Anonymous ID (cookie/IP) — auth gerekmez */
  voterId: string;
  /** Helpful mi? */
  isHelpful: boolean;
  /** Opsiyonel yorum */
  comment: string | null;
  createdAt: string;
}

export interface KbStats {
  totalArticles: number;
  publishedArticles: number;
  totalCategories: number;
  totalViews: number;
  totalHelpfulYes: number;
  totalHelpfulNo: number;
  helpfulRatio: number;
  /** En çok görüntülenen */
  topArticles: Array<{ id: string; title: string; slug: string; viewCount: number }>;
  /** En çok aranan (log tablosundan) */
  topSearches: Array<{ query: string; count: number }>;
}