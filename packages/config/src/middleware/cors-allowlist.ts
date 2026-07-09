/**
 * CORS allowlist yardımcıları.
 *
 * Ortam değişkeninden virgülle ayrılmış origin listesi okur ve
 * verilen kaynak adresin izinli olup olmadığını söyler.
 * `*` değerine izin verilmez — `cors` konfigürasyonu kabul etmez.
 *
 * @module middleware/cors-allowlist
 */

/** Virgülle ayrılmış listeden bir CORS origin seti çıkarır. */
export function parseCorsOrigins(
  rawCsv: string | undefined,
): ReadonlySet<string> {
  if (!rawCsv) return new Set();
  return new Set(
    rawCsv
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && s !== '*'),
  );
}

/** Verilen origin'in allowlist'te olup olmadığını söyler. */
export function isOriginAllowed(
  origin: string | undefined,
  allowSet: ReadonlySet<string>,
): boolean {
  if (!origin) return false;
  return allowSet.has(origin.toLowerCase());
}
