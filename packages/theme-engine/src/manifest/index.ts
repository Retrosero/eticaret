/**
 * Tema manifest standardı — Zod şeması ve doğrulama yardımcıları.
 *
 * Bir temanın yüklenebilmesi için `theme.manifest.json` dosyasının bu şemaya
 * uygun olması gerekir. Doğrulama hem sunucu (yükleme) hem de istemci (UI
 * form) tarafında yapılır.
 *
 * Güvenlik notu: Zod şeması dışarıdan gelen her manifest için zorunlu olarak
 * çalıştırılır; geçersiz manifest çalıştırılmaz.
 */

import { z } from 'zod';
import type { ThemeManifest, ThemeBlockType } from '../types/index.js';

/** Hex renk regex'i (3, 4, 6 veya 8 karakter). */
const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Semver (major.minor.patch, opsiyonel pre-release). */
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Tema blok tipleri — tek kaynak. */
export const THEME_BLOCK_TYPES: ReadonlyArray<ThemeBlockType> = [
  'hero',
  'slider',
  'banner-grid',
  'featured-products',
  'new-products',
  'best-sellers',
  'category-showcase',
  'brand-showcase',
  'countdown',
  'text-image',
  'video-embed',
  'testimonials',
  'blog-list',
  'newsletter',
  'faq',
  'html',
];

/** Tek bir design token şeması. */
export const designTokenSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9-]*$/, 'token adı: küçük harf, rakam, tire'),
  category: z.enum([
    'color',
    'font',
    'spacing',
    'radius',
    'shadow',
    'breakpoint',
    'motion',
  ]),
  type: z.enum(['string', 'number', 'color']),
  defaultValue: z.union([z.string().max(500), z.number()]),
  description: z.string().max(500).optional(),
});

/** Varyant şeması. */
export const themeVariantsSchema = z.object({
  header: z.array(z.enum(['classic', 'mega-menu', 'transparent'])).min(1),
  footer: z
    .array(z.enum(['two-column', 'three-column', 'four-column']))
    .min(1),
  productCard: z
    .array(z.enum(['horizontal', 'vertical', 'compact']))
    .min(1),
  categoryPage: z
    .array(z.enum(['sidebar-filter', 'top-filter']))
    .min(1),
  productDetailGallery: z
    .array(z.enum(['classic', 'zoom', 'carousel']))
    .min(1),
});

/** Tema manifest Zod şeması. */
export const themeManifestSchema = z
  .object({
    id: z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'id: kebab-case'),
    name: z.string().min(2).max(100),
    description: z.string().min(2).max(500),
    author: z.string().min(1).max(100),
    version: z.string().regex(SEMVER_REGEX, 'version: geçerli semver'),
    screenshots: z.array(z.string().url().max(2048)).max(20),
    tokens: z.record(z.union([z.string().max(500), z.number()])),
    layouts: z.array(z.string().min(1).max(60)).min(1),
    blocks: z.array(z.enum(THEME_BLOCK_TYPES as unknown as [string, ...string[]])).min(1),
    variants: themeVariantsSchema,
    minPlatformVersion: z.string().regex(SEMVER_REGEX),
  })
  .superRefine((value, ctx) => {
    /**
     * Token değerleri içindeki renklerin geçerli hex olup olmadığını kontrol et.
     * Renk kategorili token'lar için sıkı doğrulama; diğerleri için hafif.
     * Token anahtarı formu: "color.primary", "color.background", "color-bg" vs.
     * "color" veya "color-" ile başlayan tüm anahtarlar renk olarak değerlendirilir.
     */
    for (const [key, val] of Object.entries(value.tokens)) {
      if (typeof val !== 'string') continue;
      const normalizedKey = key.toLowerCase().replace(/[_.\s]+/g, '-');
      const isColorKey = normalizedKey === 'color' || normalizedKey.startsWith('color-');
      if (isColorKey && !HEX_COLOR_REGEX.test(val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tokens', key],
          message: `Geçersiz hex renk: ${key} = ${val}`,
        });
      }
    }
  });

/**
 * Manifest'i doğrular. Geçerli ise parse edilmiş manifest'i döner,
 * değilse hata fırlatır.
 */
export function parseThemeManifest(input: unknown): ThemeManifest {
  return themeManifestSchema.parse(input) as ThemeManifest;
}

/**
 * Manifest'i doğrular ama hata fırlatmaz, sonucu discriminated union olarak
 * döner. UI tarafında hata gösterimi için uygundur.
 */
export function safeParseThemeManifest(
  input: unknown,
): { ok: true; data: ThemeManifest } | { ok: false; error: z.ZodError } {
  const result = themeManifestSchema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data as ThemeManifest };
  }
  return { ok: false, error: result.error };
}

/** Semver karşılaştırma — major değişiklik tespiti. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parseVersion = (v: string): [number, number, number] => {
    const parts = v.split('.').map((n) => parseInt(n, 10));
    return [
      Number.isFinite(parts[0]) ? (parts[0] as number) : 0,
      Number.isFinite(parts[1]) ? (parts[1] as number) : 0,
      Number.isFinite(parts[2]) ? (parts[2] as number) : 0,
    ];
  };

  const va = parseVersion(a);
  const vb = parseVersion(b);

  for (let i = 0; i < 3; i += 1) {
    const av = va[i] ?? 0;
    const bv = vb[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

/** Major sürüm değişti mi? */
export function isMajorVersionChange(from: string, to: string): boolean {
  const parseMajor = (v: string): number => parseInt(v.split('.')[0] ?? '0', 10);
  return parseMajor(from) !== parseMajor(to);
}

/** Manifest'in minimum platform sürümünü karşılıyor mu? */
export function meetsMinPlatformVersion(
  manifest: ThemeManifest,
  currentVersion: string,
): boolean {
  return compareSemver(currentVersion, manifest.minPlatformVersion) >= 0;
}