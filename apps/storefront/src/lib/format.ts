/**
 * Para formatlama yardımcısı.
 *
 * Tüm kuruş değerleri Türkçe locale formatında (binlik ayırıcı '.',
 * ondalık ',') döndürür. ₺ sembolü eklenir.
 *
 * NOT: SSR sırasında Hydration uyumluluğu için `Intl.NumberFormat`
 * (Türkçe locale kullanılır).
 */

const FORMATTER_CACHE = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  const cached = FORMATTER_CACHE.get(currency);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  FORMATTER_CACHE.set(currency, formatter);
  return formatter;
}

/**
 * Kuruş cinsinden fiyatı Türkçe formatında döndürür.
 *
 * @param kurus Kuruş miktarı (örn. 5000 = 50,00 ₺).
 * @param currency Para birimi kodu (varsayılan: TRY).
 */
export function formatPriceKurus(kurus: number, currency: string = 'TRY'): string {
  const major = kurus / 100;
  return getFormatter(currency).format(major);
}

/**
 * Tarihten YYYY-AA-GG formatında string.
 */
export function formatDateTr(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Tarihten YYYY-AA-GG Saat:Dakika formatında string.
 */
export function formatDateTimeTr(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
