import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  ThemeResolver,
  type NavigationMenu,
  type NavigationMenuItem,
  type ResolvedAssignment,
  type ResolvedTheme,
  type SEOSetting,
  type ThemeManifest,
  parseThemeManifest,
  verifyThemePreviewToken,
  type ThemePreviewClaims,
} from '@eticart/theme-engine';
import {
  HttpStorefrontSdk,
  InMemoryStorefrontSdk,
  type InMemoryStorefrontData,
  type StorefrontSdk,
} from '@eticart/storefront-sdk';
import { queryControlRows } from '../../src/lib/server/control-db';
import type { StorefrontTenantContext } from '../../src/lib/theme/types';

export interface LoadThemeOptions {
  readonly ctx: StorefrontTenantContext;
  readonly demoData?: InMemoryStorefrontData;
  readonly backendUrl?: string;
  readonly previewToken?: string;
}

interface ThemeAssignmentRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  theme_id: string;
  theme_version: string;
  status: 'draft' | 'active' | 'archived';
  overrides: Record<string, string | number>;
  logo_url: string | null;
  favicon_url: string | null;
  activated_at: string | null;
}

interface MenuRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  status: 'draft' | 'published';
  updated_at: string;
}

interface MenuItemRow extends Record<string, unknown> {
  id: string;
  parent_id: string | null;
  label: string;
  href: string;
  external: boolean;
  sort_order: number;
}

interface SeoRow extends Record<string, unknown> {
  tenant_id: string;
  title_template: string;
  default_title: string;
  default_description: string;
  default_og_image: string | null;
  robots: string;
  sitemap_enabled: boolean;
  canonical_base: string | null;
  scripts: Array<{
    id?: string;
    position?: 'head' | 'body';
    kind?: 'analytics' | 'pixel' | 'chat' | 'custom';
    content?: string;
    adminOnly?: true;
  }>;
  updated_at: string;
}

const manifestCache = new Map<string, ThemeManifest>();
const assignmentRepo = new Map<string, ResolvedAssignment>();

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
      { id: 'm-2', label: 'Kadin', href: '/kategori/kadin', external: false, children: [] },
      { id: 'm-3', label: 'Erkek', href: '/kategori/erkek', external: false, children: [] },
      { id: 'm-4', label: 'Indirim', href: '/koleksiyon/indirim', external: false, children: [] },
      { id: 'm-5', label: 'Blog', href: '/blog', external: false, children: [] },
      { id: 'm-6', label: 'Hakkimizda', href: '/hakkimizda', external: false, children: [] },
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
      { id: 'fm-2', label: 'Iletisim', href: '/iletisim', external: false, children: [] },
      { id: 'fm-3', label: 'KVKK', href: '/kvkk', external: false, children: [] },
      { id: 'fm-4', label: 'Teslimat ve Iade', href: '/teslimat-ve-iade', external: false, children: [] },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  seo: {
    tenantId: '00000000-0000-0000-0000-000000000001',
    titleTemplate: '%s | EtiCart Magaza',
    defaultTitle: 'EtiCart Magaza',
    defaultDescription: 'Modern Turkce e-ticaret deneyimi',
    defaultOgImage: null,
    robots: 'index, follow',
    sitemapEnabled: true,
    canonicalBase: null,
    scripts: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  activatedAt: '2026-01-01T00:00:00.000Z',
};

export async function loadManifestFromDisk(themeId: string): Promise<ThemeManifest | null> {
  const cached = manifestCache.get(themeId);
  if (cached) return cached;
  try {
    const themesDir = path.join(process.cwd(), 'themes');
    const filePath = path.join(themesDir, themeId, 'manifest.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = parseThemeManifest(JSON.parse(raw));
    manifestCache.set(themeId, parsed);
    return parsed;
  } catch (error) {
    if (process.env['NODE_ENV'] !== 'production') {
      // eslint-disable-next-line no-console
      console.error(`[theme-loader] geçersiz tema manifesti: ${themeId}`, error);
    }
    return null;
  }
}

export function ensureDefaultAssignment(): void {
  if (!assignmentRepo.has(defaultAssignment.assignmentId)) {
    assignmentRepo.set(defaultAssignment.assignmentId, defaultAssignment);
  }
}

export function setAssignment(assignment: ResolvedAssignment): void {
  assignmentRepo.set(assignment.assignmentId, assignment);
}

function cloneDefaultAssignment(tenantId: string): ResolvedAssignment {
  return {
    ...defaultAssignment,
    assignmentId: `fallback-${tenantId}`,
    tenantId,
    headerMenu: { ...defaultAssignment.headerMenu, tenantId },
    footerMenu: { ...defaultAssignment.footerMenu, tenantId },
    seo: { ...defaultAssignment.seo, tenantId },
  };
}

function mapMenuItems(rows: MenuItemRow[], parentId: string | null = null): NavigationMenuItem[] {
  return rows
    .filter((row) => (row.parent_id ?? null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      id: row.id,
      label: row.label,
      href: row.href,
      external: row.external,
      children: mapMenuItems(rows, row.id),
    }));
}

function fallbackMenu(
  type: 'header' | 'footer',
  tenantId: string,
): NavigationMenu {
  const menu = type === 'header' ? defaultAssignment.headerMenu : defaultAssignment.footerMenu;
  return {
    ...menu,
    tenantId,
  };
}

function fallbackSeo(tenantId: string): SEOSetting {
  return {
    ...defaultAssignment.seo,
    tenantId,
  };
}

async function loadMenu(
  tenantId: string,
  type: 'header' | 'footer',
): Promise<NavigationMenu> {
  const menus = await queryControlRows<MenuRow>(
    `SELECT id, tenant_id, status, updated_at
     FROM public.navigation_menus
     WHERE tenant_id = $1 AND type = $2
     LIMIT 1`,
    [tenantId, type],
  );
  const menu = menus[0];
  if (!menu) return fallbackMenu(type, tenantId);

  const items = await queryControlRows<MenuItemRow>(
    `SELECT id, parent_id, label, href, external, sort_order
     FROM public.navigation_menu_items
     WHERE menu_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [menu.id],
  );

  return {
    id: menu.id,
    tenantId: menu.tenant_id,
    type,
    status: menu.status,
    items: mapMenuItems(items),
    updatedAt: menu.updated_at,
  };
}

async function loadSeo(tenantId: string): Promise<SEOSetting> {
  const rows = await queryControlRows<SeoRow>(
    `SELECT
       tenant_id,
       title_template,
       default_title,
       default_description,
       default_og_image,
       robots,
       sitemap_enabled,
       canonical_base,
       scripts,
       updated_at
     FROM public.seo_settings
     WHERE tenant_id = $1
     LIMIT 1`,
    [tenantId],
  );
  const row = rows[0];
  if (!row) return fallbackSeo(tenantId);

  return {
    tenantId: row.tenant_id,
    titleTemplate: row.title_template,
    defaultTitle: row.default_title,
    defaultDescription: row.default_description,
    defaultOgImage: row.default_og_image,
    robots: row.robots,
    sitemapEnabled: row.sitemap_enabled,
    canonicalBase: row.canonical_base,
    scripts: Array.isArray(row.scripts)
      ? row.scripts.map((script, index) => ({
          id: script.id ?? `script-${index + 1}`,
          position: script.position === 'body' ? 'body' : 'head',
          kind: script.kind ?? 'custom',
          content: script.content ?? '',
          adminOnly: true,
        }))
      : [],
    updatedAt: row.updated_at,
  };
}

async function loadDbAssignment(tenantId: string): Promise<ResolvedAssignment | null> {
  const rows = await queryControlRows<ThemeAssignmentRow>(
    `SELECT
       id,
       tenant_id,
       theme_id,
       theme_version,
       status,
       overrides,
       logo_url,
       favicon_url,
       activated_at
     FROM public.tenant_theme_assignments
     WHERE tenant_id = $1 AND status = 'active'
     ORDER BY activated_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [tenantId],
  );
  const row = rows[0];
  if (!row) return null;

  const [headerMenu, footerMenu, seo] = await Promise.all([
    loadMenu(tenantId, 'header'),
    loadMenu(tenantId, 'footer'),
    loadSeo(tenantId),
  ]);

  return {
    assignmentId: row.id,
    tenantId: row.tenant_id,
    themeId: row.theme_id,
    version: row.theme_version,
    status: row.status,
    overrides: row.overrides ?? {},
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    headerMenu,
    footerMenu,
    seo,
    activatedAt: row.activated_at,
  };
}

async function loadPreviewAssignment(
  tenantId: string,
  claims: ThemePreviewClaims,
): Promise<ResolvedAssignment | null> {
  if (claims.tenantId !== tenantId) return null;
  const rows = await queryControlRows<ThemeAssignmentRow>(
    `SELECT id, tenant_id, theme_id, theme_version, status, overrides,
            logo_url, favicon_url, activated_at
     FROM public.tenant_theme_assignments
     WHERE id = $1 AND tenant_id = $2 AND status = 'draft'
     LIMIT 1`,
    [claims.assignmentId, tenantId],
  );
  const row = rows[0];
  if (!row) return null;
  const [headerMenu, footerMenu, seo] = await Promise.all([
    loadMenu(tenantId, 'header'),
    loadMenu(tenantId, 'footer'),
    loadSeo(tenantId),
  ]);
  return {
    assignmentId: row.id,
    tenantId: row.tenant_id,
    themeId: row.theme_id,
    version: row.theme_version,
    status: 'draft',
    overrides: row.overrides ?? {},
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    headerMenu,
    footerMenu,
    seo,
    activatedAt: row.activated_at,
  };
}

function findRepoAssignment(
  tenantId: string,
  status: 'active' | 'draft' | 'archived',
): ResolvedAssignment | null {
  for (const assignment of assignmentRepo.values()) {
    if (assignment.tenantId === tenantId && assignment.status === status) {
      return assignment;
    }
  }
  return null;
}

function makeResolver(previewAssignment?: ResolvedAssignment): ThemeResolver {
  ensureDefaultAssignment();
  return new ThemeResolver({
    platformVersion: '5.0.0',
    manifestProvider: async ({ themeId }) => loadManifestFromDisk(themeId),
    assignmentProvider: {
      getActiveAssignment: async (tenantId) => {
        const repoAssignment = findRepoAssignment(tenantId, 'active');
        if (repoAssignment) return repoAssignment;
        try {
          return (await loadDbAssignment(tenantId)) ?? cloneDefaultAssignment(tenantId);
        } catch {
          return cloneDefaultAssignment(tenantId);
        }
      },
      listDrafts: async (tenantId) => {
        const repoDraft = findRepoAssignment(tenantId, 'draft');
        return previewAssignment?.tenantId === tenantId
          ? [previewAssignment]
          : repoDraft ? [repoDraft] : [];
      },
      listArchive: async (tenantId) => {
        const repoArchive = findRepoAssignment(tenantId, 'archived');
        return repoArchive ? [repoArchive] : [];
      },
    },
  });
}

function makeSdk(opts: LoadThemeOptions): StorefrontSdk {
  return opts.demoData
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
      });
}

export async function loadTheme(opts: LoadThemeOptions): Promise<{
  theme: ResolvedTheme;
  sdk: StorefrontSdk;
}> {
  let previewAssignment: ResolvedAssignment | undefined;
  const previewSecret = process.env['THEME_PREVIEW_SECRET'] ?? process.env['JWT_SECRET'];
  if (opts.previewToken && previewSecret) {
    const claims = verifyThemePreviewToken(opts.previewToken, previewSecret);
    if (claims) {
      previewAssignment = (await loadPreviewAssignment(opts.ctx.tenantId, claims)) ?? undefined;
    }
  }

  const resolver = makeResolver(previewAssignment);
  const result = previewAssignment
    ? await resolver.resolveDraft(opts.ctx.tenantId, previewAssignment.assignmentId)
    : await resolver.resolve(opts.ctx.tenantId);

  if (!result.ok) {
    const fallbackManifest = await loadManifestFromDisk('modern');
    if (!fallbackManifest) {
      throw new Error('Tema yuklenemedi (fallback dahil)');
    }

    return {
      theme: {
        manifest: fallbackManifest,
        tokens: fallbackManifest.tokens,
        variants: fallbackManifest.variants,
        headerMenu: cloneDefaultAssignment(opts.ctx.tenantId).headerMenu,
        footerMenu: cloneDefaultAssignment(opts.ctx.tenantId).footerMenu,
        logoUrl: null,
        faviconUrl: null,
        seo: cloneDefaultAssignment(opts.ctx.tenantId).seo,
        assignmentId: `fallback-${opts.ctx.tenantId}`,
      },
      sdk: makeSdk(opts),
    };
  }

  return {
    theme: result.theme,
    sdk: makeSdk(opts),
  };
}
