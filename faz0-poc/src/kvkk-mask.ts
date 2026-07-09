/**
 * kvkk-mask.ts — KVKK uyumlu loglama yardımcıları.
 *
 * Hassas alanlar (e-posta, telefon, TCKN, IBAN, adres detayları) maskelenir.
 * Bu modül tüm log çağrıları tarafından zorla uygulanır.
 *
 * ADR-001 §6 R7 — KVKK loglama riski.
 */

/**
 * E-posta adresini maskeler: a***@example.com formatına getirir.
 *
 * @param email ham e-posta
 * @returns maskelenmiş e-posta
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '[email yok]';
  const at = email.indexOf('@');
  if (at <= 1) return '***';
  return `${email[0]}***${email.substring(at)}`;
}

/**
 * Telefon numarasını maskeler: +90 5XX XXX 12 34 formatı.
 *
 * @param phone ham telefon
 * @returns maskelenmiş telefon
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '[tel yok]';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const last4 = digits.substring(digits.length - 4);
  return `+XX XXX XXX ${last4}`;
}

/**
 * TCKN maskeleme: İlk ve son 1-2 hane hariç hepsi yıldız.
 */
export function maskTckn(tckn: string | null | undefined): string {
  if (!tckn) return '[tckn yok]';
  const digits = tckn.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `${digits.substring(0, 2)}****${digits.substring(digits.length - 2)}`;
}

/**
 * Adres maskeleme: il veya ilçe varsa onu bırakır, gerisini maskeler.
 */
export function maskAddress(address: string | null | undefined): string {
  if (!address) return '[adres yok]';
  const parts = address.split(',');
  if (parts.length <= 1) return '***';
  return parts[0]?.trim() + ', ***';
}

/**
 * Genel amaçlı log objesi: Verilen nesnenin değerlerini bilinen
 * hassas anahtarlara göre maskeleyerek yeni bir nesne döndürür.
 *
 * @param record loglanacak kayıt
 * @returns maskelenmiş kopya
 */
export function safeLog<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  const SENSITIVE_KEYS = new Set([
    'email',
    'phone',
    'tckn',
    'identity_number',
    'iban',
    'card_number',
    'cvv',
    'address',
    'full_address',
    'password',
    'api_key',
    'secret',
    'token',
  ]);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '***MASKED***';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = safeLog(v as Record<string, unknown>);
    } else if (typeof v === 'string') {
      // Değer içinde @ varsa ve "email" gibi görünüyorsa maskele
      out[k] = maskIfLooksLikeEmail(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function maskIfLooksLikeEmail(s: string): string {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return maskEmail(s);
  return s;
}
