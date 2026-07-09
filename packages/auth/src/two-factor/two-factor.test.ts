/**
 * 2FA (TOTP) testleri.
 */

import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import {
  generateTotpSecret,
  verifyTotpCode,
  generateBackupCodes,
  consumeBackupCode,
} from './index.js';

describe('TOTP secret', () => {
  it('secret ve QR data URL üretir', async () => {
    const t = await generateTotpSecret('user@example.com', 'EtiCart');
    expect(t.secret.length).toBeGreaterThan(10);
    expect(t.qrCodeDataUrl.startsWith('data:image/')).toBe(true);
    expect(t.manualEntryKey).toBe(t.secret);
  });

  it('TOTP kodu doğrulanır', async () => {
    const t = await generateTotpSecret('user@example.com', 'EtiCart');
    const code = authenticator.generate(t.secret);
    expect(verifyTotpCode(code, t.secret)).toBe(true);
  });

  it('yanlış kod reddedilir', async () => {
    const t = await generateTotpSecret('user@example.com', 'EtiCart');
    expect(verifyTotpCode('000000', t.secret)).toBe(false);
  });
});

describe('Backup kodları', () => {
  it('10 adet kod üretir', async () => {
    const r = await generateBackupCodes(10);
    expect(r.plain.length).toBe(10);
    expect(r.hashed.length).toBe(10);
    for (const c of r.plain) {
      expect(c).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2}$/);
    }
  });

  it('her kod bir kez kullanılabilir', async () => {
    const r = await generateBackupCodes(5);
    const first = r.plain[0]!;
    const result = await consumeBackupCode(first, r.hashed);
    expect(result.matched).toBe(true);
  });

  it('olmayan kod eşleşmez', async () => {
    const r = await generateBackupCodes(5);
    const result = await consumeBackupCode('ZZZ-ZZZ-ZZ', r.hashed);
    expect(result.matched).toBe(false);
  });
});