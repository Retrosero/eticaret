/**
 * Design token sistemi — CSS değişkenlerine dönüşüm ve override mekanizması.
 *
 * Tasarım token'ları manifest içinde `tokens` alanında taşınır. Her token bir
 * CSS değişkenine yansır. Tenant override'ları runtime'da uygulanır.
 *
 * Örnek:
 *   { "color.primary": "#1f6feb", "font.heading": "Inter, sans-serif" }
 *     ↓
 *   :root { --color-primary: #1f6feb; --font-heading: Inter, sans-serif; }
 */

import type { DesignTokenValues } from '../types/index.js';

/** Token anahtarını CSS değişken adına çevirir. */
export function tokenKeyToCssVar(key: string): string {
  // "color.primary" → "--color-primary"
  // nokta, boşluk ve alt çizgi dışındaki özel karakterleri tireye çevir
  const normalized = key.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
  return `--${normalized}`;
}

/**
 * CSS değişken adından token anahtarına geri çevirir.
 *   "--color-primary" → "color.primary"
 */
export function cssVarToTokenKey(varName: string): string {
  if (!varName.startsWith('--')) return varName;
  return varName.slice(2);
}

/**
 * Token değerlerini CSS değişken tanımlarına çevirir.
 *
 * @param tokens Aktif token değerleri (override uygulanmış).
 * @param selector Hedef seçici (varsayılan `:root`).
 * @returns Satır sonu ile birleştirilmiş CSS string'i.
 */
export function tokensToCssVariables(
  tokens: DesignTokenValues,
  selector: string = ':root',
): string {
  const lines: string[] = [];
  lines.push(`${selector} {`);
  for (const [key, value] of Object.entries(tokens)) {
    const cssVar = tokenKeyToCssVar(key);
    const safeValue = sanitizeCssValue(value);
    if (safeValue === null) continue;
    lines.push(`  ${cssVar}: ${safeValue};`);
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * Tenant override değerlerini, varsayılan token'ların üzerine yazar.
 * Yalnızca manifest'te tanımlı anahtarlara izin verir.
 *
 * @param base Manifest'in varsayılan token değerleri.
 * @param overrides Tenant'ın override ettiği değerler.
 * @returns Birleşik değerler (override > base).
 */
export function applyTokenOverrides(
  base: DesignTokenValues,
  overrides: Partial<DesignTokenValues> | undefined,
): DesignTokenValues {
  if (!overrides) return base;
  const result: Record<string, string | number> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) continue;
    if (!(key in base)) continue; // manifest dışı override kabul edilmez
    // Basit tip uyumu: ya aynı tipte ya da sayı <-> sayı string
    const baseVal = base[key];
    if (typeof baseVal === typeof value) {
      result[key] = value;
    } else if (
      typeof baseVal === 'number' &&
      typeof value === 'string' &&
      value.trim() !== '' &&
      !Number.isNaN(Number(value))
    ) {
      result[key] = Number(value);
    } else if (
      typeof baseVal === 'string' &&
      typeof value === 'number'
    ) {
      result[key] = String(value);
    }
  }
  return result;
}

/**
 * CSS değerinin güvenli olup olmadığını kontrol eder ve gerekirse sanitize eder.
 *
 * Engellenenler:
 *  - `</style>`, `javascript:`, `expression(` gibi CSS injection vektörleri.
 *  - Satır sonu karakteri içeren değerler (CSS'i kırmak için kullanılabilir).
 *  - Süslü parantez içeren değerler (CSS bloğu enjekte etmek için).
 */
export function sanitizeCssValue(value: string | number): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  const v = value.trim();
  if (v.length === 0 || v.length > 1000) return null;

  // Yasaklı kalıplar (case-insensitive)
  const bannedPatterns = [
    /<\s*\/\s*style/i,
    /<\s*style/i,
    /javascript\s*:/i,
    /expression\s*\(/i,
    /url\s*\(\s*["']?\s*javascript:/i,
    /url\s*\(\s*["']?\s*data:/i,
    /@import/i,
    /[\r\n]/,
    /[{}]/,
    /\\/,
  ];

  for (const pattern of bannedPatterns) {
    if (pattern.test(v)) return null;
  }
  return v;
}

/** Tenant override değerlerinin güvenli olup olmadığını doğrular. */
export function validateTokenOverrides(
  overrides: Partial<DesignTokenValues> | undefined,
): string[] {
  if (!overrides) return [];
  const errors: string[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        errors.push(`${key}: geçersiz sayı`);
      }
      continue;
    }
    const sanitized = sanitizeCssValue(value);
    if (sanitized === null) {
      errors.push(`${key}: güvenli olmayan CSS değeri`);
    }
  }
  return errors;
}

/**
 * Token değerini okumak için yardımcı.
 * (Server tarafında config çözümlemesi için.)
 */
export function getToken(
  tokens: DesignTokenValues,
  key: string,
): string | number | undefined {
  return tokens[key];
}