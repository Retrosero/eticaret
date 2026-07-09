/**
 * TOTP (Time-based One-Time Password) — RFC 6238.
 *
 * Google Authenticator, Authy ve benzeri uygulamalarla uyumlu.
 * Ek bağımlılık yok (vanilla Node.js crypto).
 *
 * Akış:
 *   1. setupTwoFactor(secret) → secret + QR code URL
 *   2. Kullanıcı QR'ı tarar (Google Authenticator ekler)
 *   3. Login sırasında verifyTotp(secret, "123456") → true/false
 *
 * Güvenlik:
 *   - ±1 time-step (30s) tolerans (clock skew)
 *   - Timing-safe karşılaştırma (HMAC)
 */
import { createHmac } from 'node:crypto';

/** TOTP periyodu (RFC 6238 default: 30 saniye). */
export const TOTP_PERIOD = 30;
/** TOTP kod uzunluğu (RFC 6238 default: 6). */
export const TOTP_DIGITS = 6;
/** Kabul edilen time-step toleransı (önceki/sonraki). */
export const TOTP_WINDOW = 1;

/**
 * Base32 encode (RFC 4648) — secret key'i QR uyumlu string'e çevirir.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  // RFC 4648 §6 padding: çıktı uzunluğu 8'in katı olmalı
  while (result.length % 8 !== 0) {
    result += '=';
  }

  return result;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Geçersiz base32 karakter: ${char}`);

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** Rastgele 20-byte secret (160-bit — RFC 6238 önerisi). */
export function generateSecret(bytes = 20): string {
  const buf = Buffer.alloc(bytes);
  // Node 19+ crypto.getRandomValues
  // Node 18: crypto.randomFillSync
  const { randomFillSync } = require('node:crypto') as typeof import('node:crypto');
  randomFillSync(buf);
  return base32Encode(buf);
}

/**
 * otpauth:// URI (QR code için — Google Authenticator formatı).
 *
 *   otpauth://totp/Issuer:user@example.com?secret=ABC...&issuer=eticart
 */
export function generateOtpAuthUrl(opts: {
  secret: string;
  accountName: string;
  issuer?: string;
  period?: number;
  digits?: number;
}): string {
  const issuer = opts.issuer ?? 'eticart';
  const period = opts.period ?? TOTP_PERIOD;
  const digits = opts.digits ?? TOTP_DIGITS;

  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(opts.accountName)}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer,
    period: String(period),
    digits: String(digits),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

/** TOTP kodu üret (test/utility için). */
export function generateTotp(secret: string, timestampMs?: number, digits: number = TOTP_DIGITS): string {
  const counter = Math.floor((timestampMs ?? Date.now()) / 1000 / TOTP_PERIOD);
  return hotpFromCounter(secret, counter, digits);
}

/** HOTP (RFC 4226) — TOTP'nin temeli. */
function hotpFromCounter(secret: string, counter: number, digits: number = TOTP_DIGITS): string {
  const key = base32Decode(secret);
  const counterBuf = Buffer.alloc(8);
  // Big-endian 64-bit counter
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', key).update(counterBuf).digest();

  // Dynamic truncation (RFC 4226 §5.3)
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = (binary % 10 ** digits).toString().padStart(digits, '0');
  return otp;
}

/**
 * TOTP kodunu doğrula.
 *
 * `window` parametresi ±tolerans sayısı (clock skew).
 * window=1 → -30s ... +30s aralığında kabul.
 *
 * Replay koruması caller'a aittir (son kullanılan kod DB'ye yazılır).
 */
export function verifyTotp(
  secret: string,
  code: string,
  options?: { window?: number; timestampMs?: number },
): boolean {
  const window = options?.window ?? TOTP_WINDOW;
  const timestampMs = options?.timestampMs ?? Date.now();

  if (!/^\d{6}$/.test(code)) return false;

  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD);

  for (let i = -window; i <= window; i++) {
    const expected = hotpFromCounter(secret, counter + i);
    if (timingSafeEqualString(expected, code)) {
      return true;
    }
  }

  return false;
}

/** Constant-time string karşılaştırma (timing attack koruması). */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}