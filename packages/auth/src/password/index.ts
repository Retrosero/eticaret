/**
 * Şifre politikası ve argon2 ile hash/doğrulama yardımcıları.
 *
 * - Argon2id (OWASP önerisi)
 * - Minimum 8 karakter, büyük harf, küçük harf, rakam ve özel karakter zorunlu
 * - Şifre düz metin olarak hiçbir yerde loglanmaz
 *
 * @module password
 */

import argon2 from 'argon2';
import { z } from 'zod';

/**
 * Şifre politikası — minimum 8 karakter, en az bir büyük harf,
 * bir küçük harf, bir rakam ve bir özel karakter.
 *
 * Neden katı: KVKK uyumu + veri ihlali riski azaltma.
 */
export const passwordPolicySchema = z
  .string()
  .min(8, 'Şifre en az 8 karakter olmalıdır.')
  .max(200, 'Şifre en fazla 200 karakter olabilir.')
  .refine((s) => /[a-z]/.test(s), 'Şifre en az bir küçük harf içermelidir.')
  .refine((s) => /[A-Z]/.test(s), 'Şifre en az bir büyük harf içermelidir.')
  .refine((s) => /[0-9]/.test(s), 'Şifre en az bir rakam içermelidir.')
  .refine(
    (s) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(s),
    'Şifre en az bir özel karakter içermelidir.',
  );

/**
 * Argon2id parametreleri. Bellek maliyeti / parallelism değerleri
 * OWASP 2025 önerilerine göre seçildi (m=64MB, t=3, p=4).
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Şifreyi argon2id ile hash'ler.
 *
 * Üretilen hash: `$argon2id$v=19$m=...,t=...,p=...$salt$hash`
 * Salt otomatik üretilir; hash DB'de düz metin olmadan saklanır.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (!passwordPolicySchema.safeParse(plain).success) {
    throw new PasswordPolicyError('Şifre politikası ihlal edildi.');
  }
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Şifreyi doğrular. Sabit zamanlı karşılaştırma argon2.verify içinde yapılır.
 */
export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Hash'in yeniden hash'lenmesi gerekip gerekmediğini söyler.
 * Parametreler zamanla değişirse eski hash'ler otomatik yükseltilir.
 */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

/**
 * Politika ihlali için özel hata — generic Error yerine yapısal.
 */
export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Rastgele güvenli token üretir (URL-safe base64). Şifre sıfırlama,
 * e-posta doğrulama gibi tek kullanımlık işlemler için.
 *
 * Web Crypto API kullanır; Node 18+ ve modern tarayıcılarda çalışır.
 */
export function generateSecureToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  const b64 = (globalThis as { btoa?: (s: string) => string }).btoa
    ? (globalThis as { btoa: (s: string) => string }).btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * SHA-256 ile bir değerin hash'ini üretir. Refresh token gibi
 * "DB'de hash'li tutulacak ama doğrulama için lazım olan" değerler için.
 *
 * DİKKAT: Parola hash'i için KULLANILMAZ — parolalar için argon2 kullanılır.
 */
export async function hashTokenAsync(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return hex;
}