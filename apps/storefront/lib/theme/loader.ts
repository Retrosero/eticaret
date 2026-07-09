/**
 * Storefront — server-side tema yükleyici.
 *
 * Tenant host → aktif tema ataması → manifest çözümleme → StorefrontSdk
 * bağlama. Tüm Next.js Server Component'leri bu modülü kullanır.
 *
 * NOT: Gerçek DB entegrasyonu Faz 2'de tamamlanan `control-plane` API'si
 * üzerinden olacaktır. Faz 5'te InMemoryStorefrontData ile demo modunda
 * çalışır; production'da HttpStorefrontSdk'ya geçecektir.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  ThemeResolver,
  type ResolvedAssignment,
  type ThemeManifest,
  type ResolvedTheme,
} from '@eticart/theme-engine';
import {
  HttpStorefrontSdk,
  InMemoryStorefrontSdk,
  type StorefrontSdk,
  type InMemoryStorefrontData,
} from '@eticart/storefront-sdk';

/** Tenant context (URL'den). */
export interface StorefrontTenantContext {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly primaryDomain: string;
  readonly currency: 'TRY' | 'EUR' | 'USD';
  readonly locale: string;
}

/** Tema yükleme seçenekleri. */
export interface LoadThemeOptions {
  readonly ctx: StorefrontTenantContext;
  /** InMemory demo verisi (development). */
  readonly demoData?: InMemoryStorefrontData;
  /** Commerce backend URL (production). */
  readonly backendUrl?: string;
}

/** Manifest cache — disk okuma tekrarını önler. */
const manifestCache = new Map<string, ThemeManifest>();

/** Manifest'i diskten okur ve parse eder. */
export async function loadManifestFromDisk(themeId: string): Promise<ThemeManifest | null> {
  const cached = manifestCache.get(themeId);
  if (cached) return cached;
  try {
    const themesDir = path.join(process.cwd(), 'themes');
    const filePath = path.join(themesDir, themeId, 'manifest.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as ThemeManifest;
    manifestCache.set(themeId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** In-memory tenant atama deposu (Faz 5 demo). Production'da control-plane API. */
const assignmentRepo = new Map<string, ResolvedAssignment>();

/** Default örnek atama — Faz 5 demo için. */
const defaultAssignment: ResolvedAssignment = {
  assignmentId: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000001',
  themeId: 'modern',
  version: '1.0.0',
  status: 'active',
  overrides: {},
  logoUrl: null,
  faviconUrl: null,
  headerMenu: {
    id: '00000000-0000-0000-0000-000000000010',
    tenantId: '00000000-0000-0000-0000-000000000001',
    type: 'header',
    status: 'published',
    items: [
      { id: 'm-1', label: 'Yeni Gelenler', href: '/koleksiyon/yeni', external: false, children: [] },
      { id: 'm-2', label: 'Kadın', href: '/kategori/kadin', external: false, children: [
        { id: 'm-2-1', label: 'Elbiseler', href: '/kategori/elbiseler', external: false, children: [] },
        { id: 'm-2-2', label: 'Tişörtler', href: '/kategori/tisortler', external: false, children: [] },
      ] },
      { id: 'm-3', label: 'Erkek', href: '/kategori/erkek', external: false, children: [] },
      { id: 'm-4', label: 'İndirim', href: '/koleksiyon/indirim', external: false, children: [] },
      { id: 'm-5', label: 'Blog', href: '/blog', external: false, children: [] },
      { id: 'm-6', label: 'Hakkımızda', href: '/hakkimizda', external: false, children: [] },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  footerMenu: {
    id: '00000000-0000-0000-0000-000000000011',
    tenantId: '00000000-0000-0000-0000-000000000001',
    type: 'footer',
    status: 'published',
    items: [
      { id: 'fm-1', label: 'Anasayfa', href: '/', external: false, children: [] },
      { id: 'fm-2', label: 'Yeni Gelenler', href: '/koleksiyon/yeni', external: false, children: [] },
      { id: 'fm-3', label: 'Çok Satanlar', href: '/koleksiyon/cok-satan', external: false, children: [] },
      { id: 'fm-4', label: 'İndirim', href: '/koleksiyon/indirim', external: false, children: [] },
      { id: 'fm-5', label: 'İletişim', href: '/iletisim', external: false, children: [] },
      { id: 'fm-6', label: 'Blog', href: '/blog', external: false, children: [] },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  seo: {
    tenantId: '00000000-0000-0000-0000-000000000001',
    titleTemplate: '%s | EtiCart Mağaza',
    defaultTitle: 'EtiCart Mağaza',
    defaultDescription: 'Modern Türkçe e-ticaret deneyimi',
    defaultOgImage: null,
    robots: 'index, follow',
    sitemapEnabled: true,
    canonicalBase: null,
    scripts: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  activatedAt: '2026-01-01T00:00:00.000Z',
};

/** Demo için varsayılan atamayı kurar. */
export function ensureDefaultAssignment(): void {
  if (!assignmentRepo.has(defaultAssignment.assignmentId)) {
    assignmentRepo.set(defaultAssignment.assignmentId, defaultAssignment);
  }
}

/** Tenant atamasını ayarlar (test/demo). */
export function setAssignment(assignment: ResolvedAssignment): void {
  assignmentRepo.set(assignment.assignmentId, assignment);
}

/** Tema resolver oluşturucu. */
function makeResolver(): ThemeResolver {
  ensureDefaultAssignment();
  return new ThemeResolver({
    platformVersion: '5.0.0',
    manifestProvider: async ({ themeId }) => loadManifestFromDisk(themeId),
    assignmentProvider: {
      getActiveAssignment: async (tenantId) => {
        for (const a of assignmentRepo.values()) {
          if (a.tenantId === tenantId && a.status === 'active') return a;
        }
        return null;
      },
      listDrafts: async (tenantId) => {
        return Array.from(assignmentRepo.values()).filter(
          (a) => a.tenantId === tenantId && a.status === 'draft',
        );
      },
      listArchive: async (tenantId) => {
        return Array.from(assignmentRepo.values()).filter(
          (a) => a.tenantId === tenantId && a.status === 'archived',
        );
      },
    },
  });
}

/** Tenant için aktif temayı ve Storefront SDK'sını yükler. */
export async function loadTheme(opts: LoadThemeOptions): Promise<{
  theme: ResolvedTheme;
  sdk: StorefrontSdk;
}> {
  const resolver = makeResolver();
  const result = await resolver.resolve(opts.ctx.tenantId);
  if (!result.ok) {
    // Fallback: modern temaya düş
    const fallbackManifest = await loadManifestFromDisk('modern');
    if (!fallbackManifest) throw new Error('Tema yüklenemedi (fallback dahil)');
    const theme: ResolvedTheme = {
      manifest: fallbackManifest,
      tokens: fallbackManifest.tokens,
      variants: fallbackManifest.variants,
      headerMenu: defaultAssignment.headerMenu,
      footerMenu: defaultAssignment.footerMenu,
      logoUrl: null,
      faviconUrl: null,
      seo: defaultAssignment.seo,
      assignmentId: 'fallback',
    };
    return {
      theme,
      sdk: opts.demoData
        ? new InMemoryStorefrontSdk(
            {
              tenantId: opts.ctx.tenantId,
              tenantSlug: opts.ctx.tenantSlug,
              primaryDomain: opts.ctx.primaryDomain,
              backendUrl: null,
              locale: opts.ctx.locale,
              currency: opts.ctx.currency,
            },
            opts.demoData,
          )
        : new HttpStorefrontSdk({
            tenantId: opts.ctx.tenantId,
            tenantSlug: opts.ctx.tenantSlug,
            primaryDomain: opts.ctx.primaryDomain,
            backendUrl: opts.backendUrl ?? null,
            locale: opts.ctx.locale,
            currency: opts.ctx.currency,
          }),
    };
  }
  return {
    theme: result.theme,
    sdk: opts.demoData
      ? new InMemoryStorefrontSdk(
          {
            tenantId: opts.ctx.tenantId,
            tenantSlug: opts.ctx.tenantSlug,
            primaryDomain: opts.ctx.primaryDomain,
            backendUrl: null,
            locale: opts.ctx.locale,
            currency: opts.ctx.currency,
          },
          opts.demoData,
        )
      : new HttpStorefrontSdk({
          tenantId: opts.ctx.tenantId,
          tenantSlug: opts.ctx.tenantSlug,
          primaryDomain: opts.ctx.primaryDomain,
          backendUrl: opts.backendUrl ?? null,
          locale: opts.ctx.locale,
          currency: opts.ctx.currency,
        }),
  };
}