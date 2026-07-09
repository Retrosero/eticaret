/**
 * Dosya adı ve anahtar sanitizasyon yardımcıları.
 *
 * Amaç: path traversal saldırısını engellemek, Unicode zorlamasını önlemek.
 *  - `../`, `..\\`, null byte gibi dizin dışı atlama girişimleri kabul edilmez
 *  - Yalnızca ASCII [A-Za-z0-9._-] karakterleri
 *  - Toplam uzunluk sınırı
 */

/** Güvenli dosya adı parçalarına izin verilen regex. */
const SAFE_FILENAME_REGEX = /^[A-Za-z0-9._-]+$/;

/** Türkçe karakter → ASCII eşleme. */
const TURKISH_MAP: Record<string, string> = {
  'ı': 'i', 'İ': 'I', 'ş': 's', 'Ş': 'S',
  'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
  'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C',
};

/** Tek bir path segment'i güvenli hale getirir. */
function cleanSegment(input: string): string {
  if (!input) return '';
  let s = input.trim();

  // Yol ayraçlarını (slash/backslash) tireye çevir
  s = s.replace(/[\\\/]+/g, '-');

  // Çift veya daha fazla nokta paterni (path traversal parçası) → tire
  // Tek noktayı koru (dosya uzantısı için: .jpg, .png vb.)
  s = s.replace(/\.{2,}/g, '-');
  // Baştaki/ortadaki ".." segmentlerini de temizle (örn. "../a")
  s = s.replace(/(^|[\\/])\.\.([\\/]|$)/g, '$1$2');

  // Unicode normalize
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => TURKISH_MAP[c] ?? c);

  // Boşlukları tireye çevir
  s = s.replace(/\s+/g, '-');

  // Çoklu nokta / alt çizgi dizileri önce tireye sıkıştır
  s = s.replace(/\.{2,}/g, '-').replace(/_+/g, '-');

  // Güvenli olmayan her şeyi kaldır
  s = s.replace(/[^A-Za-z0-9._-]/g, '-');

  // Çoklu tire dizileri sıkıştır
  s = s.replace(/-+/g, '-');

  // Baş/son özel karakterleri kırp
  s = s.replace(/^[._-]+|[._-]+$/g, '');

  return s;
}

/**
 * Girdiden güvenli bir temel dosya adı üretir.
 *
 * @example
 * sanitizeFilename("../../etc/passwd")     // → "etc-passwd"
 * sanitizeFilename("ürün fotoğrafı.jpg")   // → "urun-fotograf-jpg"
 * sanitizeFilename("logo file 02.png")     // → "logo-file-02.png"
 */
export function sanitizeFilename(raw: unknown): string {
  if (typeof raw !== 'string') return 'file';
  const cleaned = cleanSegment(raw);
  if (!cleaned) return 'file';
  const truncated = cleaned.length > 200 ? cleaned.slice(0, 200) : cleaned;
  return SAFE_FILENAME_REGEX.test(truncated) ? truncated : 'file';
}

/** Mantıksal yol segment güvenlik kontrolü. */
const FORBIDDEN_SEGMENTS = new Set(['', '.', '..']);

/**
 * Mantıksal yol bileşenlerini güvenli hale getirir.
 * Her segment `cleanSegment` üzerinden geçer; traversal ve boş segment iptal.
 */
export function sanitizeLogicalPath(parts: ReadonlyArray<string>): string {
  const cleaned: string[] = [];
  for (const p of parts) {
    if (typeof p !== 'string') continue;
    for (const seg of p.split(/[\\\/]/)) {
      if (FORBIDDEN_SEGMENTS.has(seg.trim())) continue;
      const safe = cleanSegment(seg);
      if (!safe) continue;
      cleaned.push(safe);
    }
  }
  if (cleaned.length === 0) return 'misc';
  return cleaned.join('/');
}

/**
 * Tam depolama anahtarı üretir:
 *   `tenants/<tenantId>/<logicalPath>/<safeFilename>`
 *
 * Her bileşen doğrulanır; sonuç her zaman ASCII alfasayısal/tire/nokta
 * karakterlerinden oluşur.
 */
export function buildStorageKey(
  tenantId: string,
  logicalPath: string,
  filename: string,
): string {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(tenantId)) {
    throw new Error('Geçersiz tenant kimliği.');
  }
  const logical = sanitizeLogicalPath(logicalPath.split('/'));
  const safeName = sanitizeFilename(filename);
  return `tenants/${tenantId}/${logical}/${safeName}`;
}
