/**
 * KVKK uyumlu veri maskeleme yardımcıları.
 *
 * Bu fonksiyonlar kişisel verileri (e-posta, telefon, TCKN, adres)
 * kısmi olarak maskeleyerek loglamaya uygun hale getirir.
 * Orijinal değer kurtarılamaz.
 *
 * @module kvkk
 */

/**
 * E-posta maskeleme:
 *  - "john.doe@example.com" -> "j***@example.com"
 */
export function maskEmail(value: string | undefined | null): string {
  if (!value) return '';
  const at = value.indexOf('@');
  if (at <= 1) return '***';
  const firstChar = value.slice(0, 1);
  const domain = value.slice(at + 1);
  if (!domain) return `${firstChar}***`;
  return `${firstChar}***@${domain}`;
}

/**
 * Telefon maskeleme:
 *  - "+905321234567" -> "+XX XXX XXX 4567"
 */
export function maskPhone(value: string | undefined | null): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const tail = digits.slice(-4);
  return `+XX XXX XXX ${tail}`;
}

/**
 * TCKN maskeleme:
 *  - "12345678901" -> "*********01"
 */
export function maskTckn(value: string | undefined | null): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 2) return '***';
  const tail = digits.slice(-2);
  return `${'*'.repeat(digits.length - 2)}${tail}`;
}

/**
 * Adres maskeleme:
 *  - sadece şehir/ilçe görünür, sokak ve kapı no gizlenir.
 */
export function maskAddress(
  value: string | undefined | null,
  visibleSuffix = true,
): string {
  if (!value) return '';
  if (value.length <= 16) return '***';
  if (!visibleSuffix) return '***';
  return `*** ${value.slice(-16).trim()}`;
}

/**
 * Verilen objedeki bilinen KVKK alanlarını tarar ve maskeler.
 * Orijinal objeyi **mutasyona uğratmaz**; kopyasını döner.
 */
export function maskKvkkFields<T extends Record<string, unknown>>(
  obj: T | null | undefined,
): T | null {
  if (!obj) return null;
  const out: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(out)) {
    const lower = key.toLowerCase();
    const v = out[key];
    if (typeof v !== 'string') continue;
    if (lower.includes('email') || lower === 'mail') {
      out[key] = maskEmail(v);
    } else if (lower.includes('phone') || lower === 'tel') {
      out[key] = maskPhone(v);
    } else if (lower === 'tckn' || lower === 'kimlik_no' || lower === 'national_id') {
      out[key] = maskTckn(v);
    } else if (lower.includes('address')) {
      out[key] = maskAddress(v);
    }
  }
  return out as T;
}

/** Standart loglama öncesi son temizlik. */
export function safeLog<T>(obj: T): T | null {
  if (!obj || typeof obj !== 'object') return obj;
  return maskKvkkFields(obj as Record<string, unknown>) as T;
}
