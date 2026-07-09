/**
 * Slug üretim ve doğrulama yardımcıları.
 *
 * Türkçe karakterler ASCII'ye çevrilir; geri kalan karakterler
 * küçük harf + rakam + tire formatına getirilir. Sonuç, ADR-001'de
 * belirtilen güvenli şema isimlendirme kurallarına uyar.
 */

/** Güvenli slug regex'i (Postgre şema adı ile uyumlu). */
export const SAFE_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Türkçe karakterlerin ASCII karşılıkları. */
const TR_MAP: Readonly<Record<string, string>> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  Ç: 'c',
  Ğ: 'g',
  İ: 'i',
  Ö: 'o',
  Ş: 's',
  Ü: 'u',
};

/** Serbest metni güvenli slug'a çevirir. */
export function slugify(input: string): string {
  if (!input) return '';
  // Türkçe karakterleri dönüştür
  let s = '';
  for (const ch of input.toLowerCase()) {
    s += TR_MAP[ch] ?? ch;
  }
  // Alfanümerik ve tire dışındakileri tire ile değiştir
  s = s.replace(/[^a-z0-9]+/g, '-');
  // Baştaki ve sondaki tireleri kırp
  s = s.replace(/^-+|-+$/g, '');
  // Birden fazla tireyi teke indir
  s = s.replace(/-{2,}/g, '-');
  return s;
}

/** Slug'un güvenli olup olmadığını doğrular. */
export function isValidSlug(slug: string): boolean {
  return SAFE_SLUG_REGEX.test(slug);
}

/** Slug'dan Postgre şema adı üretir: `tenant_<slug>`. */
export function schemaNameFromSlug(slug: string): string | null {
  if (!isValidSlug(slug)) return null;
  return `tenant_${slug.replace(/-/g, '_')}`;
}

/** Tenant için otomatik subdomain üretir: `<slug>.<baseDomain>`. */
export function buildSubdomain(slug: string, baseDomain: string): string | null {
  if (!isValidSlug(slug)) return null;
  return `${slug}.${baseDomain}`;
}