/**
 * Blok kayıt sistemi (Registry pattern).
 *
 * Bir blok tipi (örn. "hero"), manifest tarafından bildirilir ve burada
 * kayıt altına alınır. Her kayıt:
 *  - Blok adı
 *  - Settings şeması (Zod) — admin formdan gelen JSON doğrulanır
 *  - Render fonksiyonu — server tarafında render edilir
 *
 * Render fonksiyonları server component olarak çalışır ve `Storefront SDK`
 * üzerinden tenant verisini çeker; doğrudan DB sorgusu yapmaz.
 */

import { z } from 'zod';
import type {
  PageBlockRecord,
  ThemeBlockType,
  ThemeManifest,
} from '../types/index.js';

/** Render bağlamı — render fonksiyonuna geçirilen okuma-erişimli bilgi. */
export interface BlockRenderContext {
  /** Tenant bağlamı. */
  readonly tenantId: string;
  /** Aktif tema manifest. */
  readonly manifest: ThemeManifest;
  /** Aktif tenant token değerleri (CSS değişkenlerine yansır). */
  readonly tokens: Readonly<Record<string, string | number>>;
  /** Storefront SDK'dan gelen veri fetch helper'ı. */
  readonly sdk: import('@eticart/storefront-sdk').StorefrontSdk;
  /** Dil (varsayılan 'tr'). */
  readonly locale: string;
}

/** Render fonksiyonu — server component döner. */
export type BlockRenderer = (
  block: PageBlockRecord,
  ctx: BlockRenderContext,
) => Promise<import('react').ReactNode>;

/** Registry kaydı. */
export interface BlockDefinition {
  readonly type: ThemeBlockType;
  readonly displayName: string;
  /** Settings şeması (admin form doğrulaması için). */
  readonly settingsSchema: z.ZodTypeAny;
  /** Default settings (UI sıfırlama için). */
  readonly defaultSettings: Readonly<Record<string, unknown>>;
  /** Server-side render fonksiyonu. */
  readonly render: BlockRenderer;
  /** Admin form alanları (UI tarafı için metadata). */
  readonly formFields: ReadonlyArray<BlockFormField>;
}

/** Admin form alanı. */
export interface BlockFormField {
  readonly key: string;
  readonly label: string;
  readonly kind: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'image' | 'url';
  readonly options?: ReadonlyArray<{ value: string; label: string }>;
  readonly required?: boolean;
  readonly helpText?: string;
}

/** In-memory registry. */
class BlockRegistryImpl {
  private readonly blocks = new Map<ThemeBlockType, BlockDefinition>();

  /** Bir blok tipi kaydeder. */
  register(definition: BlockDefinition): void {
    if (this.blocks.has(definition.type)) {
      // Üzerine yazmak yerine logla — geliştirme hatası olabilir.
      // Prod'da bu sessizce yok sayılır.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          `[theme-engine] blok tipi zaten kayıtlı, üzerine yazılıyor: ${definition.type}`,
        );
      }
    }
    this.blocks.set(definition.type, definition);
  }

  /** Bir blok tanımını döner. Bulunamazsa undefined. */
  get(type: ThemeBlockType): BlockDefinition | undefined {
    return this.blocks.get(type);
  }

  /** Tüm kayıtlı blokları döner. */
  list(): ReadonlyArray<BlockDefinition> {
    return Array.from(this.blocks.values());
  }

  /** Verilen blok tipinin render fonksiyonunu çağırır. */
  async render(
    block: PageBlockRecord,
    ctx: BlockRenderContext,
  ): Promise<import('react').ReactNode> {
    const def = this.blocks.get(block.type);
    if (!def) {
      // Bilinmeyen blok tipi: kullanıcıya göstermeden boş bırak
      return null;
    }
    // Settings'i şemaya göre doğrula, hatalıysa default'a düş
    const parsed = def.settingsSchema.safeParse(block.settings);
    const safeSettings = parsed.success
      ? parsed.data
      : def.defaultSettings;
    const normalized: PageBlockRecord = {
      ...block,
      settings: safeSettings as Readonly<Record<string, unknown>>,
    };
    return def.render(normalized, ctx);
  }
}

/** Singleton registry. */
export const blockRegistry = new BlockRegistryImpl();

/** Verilen blokları sırayla render eder. Hata olanlar skip edilir. */
export async function renderBlocks(
  blocks: ReadonlyArray<PageBlockRecord>,
  ctx: BlockRenderContext,
): Promise<import('react').ReactNode[]> {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const results: import('react').ReactNode[] = [];
  for (const block of sorted) {
    // Görünürlük kontrolü — desktop / mobile
    // Gerçek visibility kontrolü layout katmanında yapılır; burada sadece render
    try {
      const node = await blockRegistry.render(block, ctx);
      if (node !== null && node !== undefined) {
        results.push(node);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error(`[theme-engine] blok render hatası (${block.type}):`, err);
      }
    }
  }
  return results;
}

/**
 * Manifest'teki `blocks` listesini, registry'de gerçekten kayıtlı olanlarla
 * kesişimini alır. Eksik bloklar UI'da "Bu blok artık kullanılamıyor" olarak
 * işaretlenir.
 */
export function resolveAvailableBlocks(
  manifest: ThemeManifest,
): ReadonlyArray<ThemeBlockType> {
  const available = new Set(blockRegistry.list().map((d) => d.type));
  return manifest.blocks.filter((b) => available.has(b));
}

/**
 * Settings doğrulama — admin form submit edilmeden önce çalıştırılır.
 */
export function validateBlockSettings(
  type: ThemeBlockType,
  settings: unknown,
): { ok: true; data: unknown } | { ok: false; error: z.ZodError } {
  const def = blockRegistry.get(type);
  if (!def) {
    return {
      ok: false,
      error: new z.ZodError([
        {
          code: 'custom',
          path: ['type'],
          message: `Bilinmeyen blok tipi: ${type}`,
        },
      ]),
    };
  }
  const result = def.settingsSchema.safeParse(settings);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error };
}

/**
 * Default settings üretir (UI sıfırlama / yeni blok ekleme için).
 */
export function defaultBlockSettings(
  type: ThemeBlockType,
): Readonly<Record<string, unknown>> {
  const def = blockRegistry.get(type);
  return def ? def.defaultSettings : {};
}