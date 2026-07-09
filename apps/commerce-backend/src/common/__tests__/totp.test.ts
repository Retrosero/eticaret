/**
 * TOTP testleri — RFC 6238 uyumlu.
 *
 * Test vektörleri RFC 6238 Appendix B'den alınmıştır:
 *   secret: "12345678901234567890" (ASCII)
 *   zaman: 59 → 94287082
 */
import { describe, it, expect } from 'vitest';
import {
  generateSecret,
  generateTotp,
  verifyTotp,
  generateOtpAuthUrl,
  base32Encode,
  base32Decode,
} from '../totp.js';

describe('TOTP', () => {
  describe('Base32', () => {
    it('encode/decode roundtrip', () => {
      const original = Buffer.from('Hello World!', 'utf-8');
      const encoded = base32Encode(original);
      const decoded = base32Decode(encoded);
      expect(decoded.toString('utf-8')).toBe('Hello World!');
    });

    it('RFC 4648 test vectors', () => {
      // "" → ""
      expect(base32Encode(Buffer.alloc(0))).toBe('');
      // "f" → "MY======"
      expect(base32Encode(Buffer.from('f', 'utf-8'))).toBe('MY======');
      // "foobar" → "MZXW6YTBOI======"
      expect(base32Encode(Buffer.from('foobar', 'utf-8'))).toBe('MZXW6YTBOI======');
    });

    it('Decode error: geçersiz karakter', () => {
      expect(() => base32Decode('ABC@123')).toThrow(/Geçersiz base32/);
    });
  });

  describe('generateSecret', () => {
    it('Default 20 byte secret', () => {
      const secret = generateSecret();
      expect(secret.length).toBeGreaterThan(20);
      // Base32: 20 byte = 32 char (5 bit/char)
      expect(secret.length).toBe(32);
    });

    it('Her çağrıda farklı secret', () => {
      const s1 = generateSecret();
      const s2 = generateSecret();
      expect(s1).not.toBe(s2);
    });

    it('Custom byte sayısı', () => {
      const s = generateSecret(10);
      expect(base32Decode(s).length).toBe(10);
    });
  });

  describe('RFC 6238 test vectors', () => {
    // RFC 6238 Appendix B — secret = "12345678901234567890" (ASCII)
    const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

    // Time / T değerleri
    const tests: Array<{ time: number; expected: string }> = [
      { time: 59, expected: '94287082' }, // T = 1
      { time: 1111111109, expected: '07081804' }, // T = 37037036
      { time: 1111111111, expected: '14050471' }, // T = 37037037
      { time: 1234567890, expected: '89005924' }, // T = 41152263
      { time: 2000000000, expected: '69279037' }, // T = 66666666
    ];

    for (const { time, expected } of tests) {
      it(`T=${time} → ${expected}`, () => {
        const otp = generateTotp(secret, time * 1000, 8);
        expect(otp).toBe(expected);
      });
    }
  });

  describe('verifyTotp', () => {
    it('Geçerli kod doğrulanır', () => {
      const secret = generateSecret();
      const code = generateTotp(secret);
      expect(verifyTotp(secret, code)).toBe(true);
    });

    it('Yanlış kod reddedilir', () => {
      const secret = generateSecret();
      expect(verifyTotp(secret, '000000')).toBe(false);
      expect(verifyTotp(secret, '123456')).toBe(false);
    });

    it('Süresi dolmuş kod (±window dışı) reddedilir', () => {
      const secret = generateSecret();
      // Şu andan 5 dakika önce → window=1 ile bile kabul edilmez
      const oldCode = generateTotp(secret, Date.now() - 5 * 60 * 1000);
      expect(verifyTotp(secret, oldCode)).toBe(false);
    });

    it('Clock skew ±window tolerans', () => {
      const secret = generateSecret();
      // -1 period (30s önce) → window=1 ile kabul
      const codePrev = generateTotp(secret, Date.now() - 30 * 1000);
      expect(verifyTotp(secret, codePrev)).toBe(true);

      // +1 period (30s sonra)
      const codeNext = generateTotp(secret, Date.now() + 30 * 1000);
      expect(verifyTotp(secret, codeNext)).toBe(true);

      // ±2 period → reddedilmeli
      const codeFar = generateTotp(secret, Date.now() - 60 * 1000);
      expect(verifyTotp(secret, codeFar)).toBe(false);
    });

    it('Geçersiz format → reddedilir', () => {
      const secret = generateSecret();
      expect(verifyTotp(secret, 'abc')).toBe(false);
      expect(verifyTotp(secret, '12345')).toBe(false); // 5 hane
      expect(verifyTotp(secret, '1234567')).toBe(false); // 7 hane
      expect(verifyTotp(secret, '')).toBe(false);
    });

    it('Replay koruması caller\'a ait', () => {
      const secret = generateSecret();
      const code = generateTotp(secret);

      // İlk doğrulama başarılı
      expect(verifyTotp(secret, code)).toBe(true);
      // Aynı kod tekrar → hâlâ başarılı (replay koruması DB tarafında)
      expect(verifyTotp(secret, code)).toBe(true);
    });
  });

  describe('generateOtpAuthUrl', () => {
    it('otpa:// format üretir', () => {
      const url = generateOtpAuthUrl({
        secret: 'JBSWY3DPEHPK3PXP',
        accountName: 'admin@eticart.com.tr',
        issuer: 'eticart',
      });

      expect(url).toContain('otpauth://totp/eticart:admin%40eticart.com.tr');
      expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(url).toContain('issuer=eticart');
      expect(url).toContain('period=30');
      expect(url).toContain('digits=6');
    });

    it('Custom period ve digits', () => {
      const url = generateOtpAuthUrl({
        secret: 'JBSWY3DPEHPK3PXP',
        accountName: 'user@example.com',
        issuer: 'eticart',
        period: 60,
        digits: 8,
      });

      expect(url).toContain('period=60');
      expect(url).toContain('digits=8');
    });
  });
});