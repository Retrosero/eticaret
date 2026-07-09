/**
 * Tema resolver — tenant domain'den aktif temayı, varyantları ve override'ları
 * çözümler.
 *
 * İki modu vardır:
 *  - `RealThemeResolver`: DB'ye (veya önbelleğe) bağlanır.
 *  - `InMemoryThemeResolver`: testler / önizleme için.
 *
 * Tema bileşenleri bu resolver'a `ResolvedTheme` alarak erişir; doğrudan DB
 * sorgulaması yapmaz (KRİTİK — veri katmanı izolasyonu).
 */

import type {
  DesignTokenValues,
  NavigationMenu,
  ResolvedTheme,
  SEOSetting,
  ThemeManifest,
} from '../types/index.js';
import { applyTokenOverrides } from '../tokens/index.js';
import {
  isMajorVersionChange,
  meetsMinPlatformVersion,
} from '../manifest/index.js';

/** Manifest sağlayıcı — tema id + versiyon → manifest. */
export type ManifestProvider = (input: {
  themeId: string;
  version: string;
}) => Promise<ThemeManifest | null>;

/** Tenant atama sağlayıcı. */
export interface TenantAssignmentProvider {
  /** Tenant için aktif atamayı döner. */
  getActiveAssignment(tenantId: string): Promise<ResolvedAssignment | null>;
  /** Tenant'ın taslak atamalarını listeler. */
  listDrafts(tenantId: string): Promise<ReadonlyArray<ResolvedAssignment>>;
  /** Tenant'ın arşivlenmiş atamalarını listeler. */
  listArchive(tenantId: string): Promise<ReadonlyArray<ResolvedAssignment>>;
}

/** Çözümlenmiş tenant ataması. */
export interface ResolvedAssignment {
  readonly assignmentId: string;
  readonly tenantId: string;
  readonly themeId: string;
  readonly version: string;
  readonly status: 'draft' | 'active' | 'archived';
  readonly overrides: DesignTokenValues;
  readonly logoUrl: string | null;
  readonly faviconUrl: string | null;
  readonly headerMenu: NavigationMenu;
  readonly footerMenu: NavigationMenu;
  readonly seo: SEOSetting;
  readonly activatedAt: string | null;
}

/** Migration script çalıştırıcı (major sürüm değişikliklerinde). */
export type MigrationRunner = (input: {
  fromVersion: string;
  toVersion: string;
  themeId: string;
  tenantId: string;
}) => Promise<{ ok: boolean; migratedBlocks: number; notes: string[] }>;

/** Resolver seçenekleri. */
export interface ResolverOptions {
  /** Manifest sağlayıcı (registry veya DB). */
  readonly manifestProvider: ManifestProvider;
  /** Tenant atama sağlayıcı. */
  readonly assignmentProvider: TenantAssignmentProvider;
  /** İsteğe bağlı migration çalıştırıcı. */
  readonly migrationRunner?: MigrationRunner;
  /** İzin verilen maksimum major sürüm atlama (varsayılan 1). */
  readonly maxMajorJump?: number;
  /** Aktif platform sürümü. */
  readonly platformVersion: string;
}

/** Resolver sonucu. */
export type ResolveResult =
  | { ok: true; theme: ResolvedTheme }
  | { ok: false; reason: 'not-found' | 'invalid-manifest' | 'incompatible' | 'migration-failed'; details?: string };

/** Tema resolver. */
export class ThemeResolver {
  private readonly opts: ResolverOptions;

  constructor(opts: ResolverOptions) {
    this.opts = opts;
  }

  /**
   * Verilen tenant için aktif temayı çözümler. Tüm veri kaynakları
   * (manifest, atama, SEO, menüler) bu metot içinde toplanır; çağıran
   * taraf (örn. Next.js layout) tek bir `ResolvedTheme` alır.
   */
  async resolve(tenantId: string): Promise<ResolveResult> {
    const assignment = await this.opts.assignmentProvider.getActiveAssignment(tenantId);
    if (!assignment) {
      return { ok: false, reason: 'not-found' };
    }

    const manifest = await this.opts.manifestProvider({
      themeId: assignment.themeId,
      version: assignment.version,
    });
    if (!manifest) {
      return {
        ok: false,
        reason: 'invalid-manifest',
        details: `manifest bulunamadı: ${assignment.themeId}@${assignment.version}`,
      };
    }

    if (!meetsMinPlatformVersion(manifest, this.opts.platformVersion)) {
      return {
        ok: false,
        reason: 'incompatible',
        details: `manifest minimum sürüm: ${manifest.minPlatformVersion}, mevcut: ${this.opts.platformVersion}`,
      };
    }

    // Major sürüm değişikliği kontrolü: tenant hala eski manifest üzerinde mi?
    if (this.opts.migrationRunner && isMajorVersionChange('1.0.0', assignment.version)) {
      const migration = await this.opts.migrationRunner({
        fromVersion: '1.0.0',
        toVersion: assignment.version,
        themeId: assignment.themeId,
        tenantId,
      });
      if (!migration.ok) {
        return { ok: false, reason: 'migration-failed', details: migration.notes.join('; ') };
      }
    }

    const tokens = applyTokenOverrides(manifest.tokens, assignment.overrides);

    return {
      ok: true,
      theme: {
        manifest,
        tokens,
        variants: manifest.variants,
        headerMenu: assignment.headerMenu,
        footerMenu: assignment.footerMenu,
        logoUrl: assignment.logoUrl,
        faviconUrl: assignment.faviconUrl,
        seo: assignment.seo,
        assignmentId: assignment.assignmentId,
      },
    };
  }

  /**
   * Verilen tenant için belirli bir temayı önizleme amaçlı çözer.
   * `draft` durumundaki atamalar için kullanılır — gerçek ziyaretçilere
   * gösterilmez.
   */
  async resolveDraft(
    tenantId: string,
    assignmentId: string,
  ): Promise<ResolveResult> {
    const drafts = await this.opts.assignmentProvider.listDrafts(tenantId);
    const found = drafts.find((d) => d.assignmentId === assignmentId);
    if (!found) return { ok: false, reason: 'not-found' };

    const manifest = await this.opts.manifestProvider({
      themeId: found.themeId,
      version: found.version,
    });
    if (!manifest) return { ok: false, reason: 'invalid-manifest' };

    const tokens = applyTokenOverrides(manifest.tokens, found.overrides);

    return {
      ok: true,
      theme: {
        manifest,
        tokens,
        variants: manifest.variants,
        headerMenu: found.headerMenu,
        footerMenu: found.footerMenu,
        logoUrl: found.logoUrl,
        faviconUrl: found.faviconUrl,
        seo: found.seo,
        assignmentId: found.assignmentId,
      },
    };
  }
}

/**
 * In-memory test resolver — sahte manifest ve atama sağlar.
 * Vitest ve önizleme iframe'inde kullanılır.
 */
export class InMemoryThemeResolver extends ThemeResolver {
  private readonly manifestMap = new Map<string, ThemeManifest>();
  private readonly assignmentMap = new Map<string, ResolvedAssignment>();

  constructor(
    manifests: Iterable<ThemeManifest>,
    assignments: Iterable<ResolvedAssignment>,
    platformVersion: string = '5.0.0',
  ) {
    super({
      manifestProvider: async ({ themeId, version }) => {
        return (
          this.manifestMap.get(`${themeId}@${version}`) ??
          Array.from(this.manifestMap.values()).find((m) => m.id === themeId) ??
          null
        );
      },
      assignmentProvider: {
        getActiveAssignment: async (tenantId: string) => {
          const arr = Array.from(this.assignmentMap.values()).find(
            (a) => a.tenantId === tenantId && a.status === 'active',
          );
          return arr ?? null;
        },
        listDrafts: async (tenantId: string) => {
          return Array.from(this.assignmentMap.values()).filter(
            (a) => a.tenantId === tenantId && a.status === 'draft',
          );
        },
        listArchive: async (tenantId: string) => {
          return Array.from(this.assignmentMap.values()).filter(
            (a) => a.tenantId === tenantId && a.status === 'archived',
          );
        },
      },
      platformVersion,
    });
    for (const m of manifests) {
      this.manifestMap.set(`${m.id}@${m.version}`, m);
    }
    for (const a of assignments) {
      this.assignmentMap.set(a.assignmentId, a);
    }
  }
}