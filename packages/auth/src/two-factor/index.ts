/**
 * İki aşamalı doğrulama (TOTP) yardımcıları.
 *
 * - RFC 6238 uyumlu TOTP (otplib ile)
 * - 30 saniyelik zaman dilimi, 6 hane
 * - 10 adet tek kullanımlık backup kodu
 *
 * @module two-factor
 */

import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { hashTokenAsync } from '../password/index.js';

/** TOTP ayarları — Google Authenticator, Authy ve 1Password uyumlu. */
authenticator.options = {
  window: 1, // ±1 zaman dilimi tolerans (30s ± 30s)
  step: 30,
  digits: 6,
};

export interface TotpSecret {
  /** Gizli base32 anahtar (kullanıcıya gösterilmez; DB'de saklanır). */
  secret: string;
  /** Kullanıcının tarayıcısında gösterebileceği QR data-URL'i. */
  qrCodeDataUrl: string;
  /** Manuel giriş için okunabilir secret. */
  manualEntryKey: string;
}

/**
 * Yeni bir TOTP secret üretir ve QR kodu döner.
 *
 * @param accountName - kullanıcının e-posta veya tanımlayıcısı
 * @param issuer - platform adı (ör. "EtiCart")
 */
export async function generateTotpSecret(
  accountName: string,
  issuer: string,
): Promise<TotpSecret> {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(accountName, issuer, secret);
  const qrCodeDataUrl = await toDataURL(otpauth);
  return {
    secret,
    qrCodeDataUrl,
    manualEntryKey: secret,
  };
}

/**
 * Kullanıcının girdiği 6 haneli kodu doğrular.
 *
 * @returns başarılı ise true; aksi halde false.
 */
export function verifyTotpCode(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * 10 adet tek kullanımlık backup kodu üretir.
 *
 * Her kod 8 karakter (alfanumerik, okunabilir). DB'de hash'li saklanır.
 */
export async function generateBackupCodes(count = 10): Promise<{
  plain: ReadonlyArray<string>;
  hashed: ReadonlyArray<string>;
}> {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    // 5 byte = 10 hex karakter; sadece 0-9 + A-F kullanırız
    const bytes = new Uint8Array(5);
    globalThis.crypto.getRandomValues(bytes);
    const code = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 8)
      .toUpperCase();
    plain.push(formatBackupCode(code));
    hashed.push(await hashTokenAsync(code));
  }
  return { plain, hashed };
}

/** Backup kodu XXX-XXX-XX biçiminde formatlar (okuma kolaylığı). */
function formatBackupCode(code: string): string {
  const parts = [code.slice(0, 3), code.slice(3, 6), code.slice(6, 8)];
  return parts.join('-');
}

/** Bir backup kodunu kullanılmış olarak işaretlemek için doğrular. */
export async function consumeBackupCode(
  input: string,
  hashedCodes: ReadonlyArray<string>,
): Promise<{ matched: true; index: number } | { matched: false }> {
  // Kullanıcıdan gelen "123-456-78" gibi kodu normalize et
  const normalized = input.replace(/-/g, '').toUpperCase();
  for (let i = 0; i < hashedCodes.length; i++) {
    const ok = await compareBackup(normalized, hashedCodes[i] as string);
    if (ok) return { matched: true, index: i };
  }
  return { matched: false };
}

async function compareBackup(plain: string, hash: string): Promise<boolean> {
  const computed = await hashTokenAsync(plain);
  return constantTimeEqual(computed, hash);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
