/**
 * Şema yardımcıları.
 *
 * Faz 1'de: yalnızca saf dönüşüm fonksiyonları (slug → şema adı).
 * Faz 2'de: gerçek `pg_app` bağlantısı ile `withAppClient(schemaName, fn)`
 *            kalıbı eklenecek (bkz. `faz0-poc/src/db.ts`).
 */

/** `tenant_*` şema isimleri için izin verilen slug regex. */
export const SAFE_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Slug'un güvenli şema adına çevrilebilirliğini doğrular. */
export function isValidSlug(slug: string): boolean {
  return SAFE_SLUG_REGEX.test(slug);
}
