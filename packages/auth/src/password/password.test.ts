/**
 * Şifre politikası ve argon2 hash testleri.
 */

import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  passwordPolicySchema,
  PasswordPolicyError,
  generateSecureToken,
  hashTokenAsync,
} from './index.js';

describe('password policy', () => {
  it('en az 8 karakterli karmaşık şifreyi kabul eder', () => {
    const result = passwordPolicySchema.safeParse('Güçlü1!Şifre');
    expect(result.success).toBe(true);
  });

  it('çok kısa şifreyi reddeder', () => {
    const result = passwordPolicySchema.safeParse('Ab1!');
    expect(result.success).toBe(false);
  });

  it('büyük harf olmadan reddeder', () => {
    const result = passwordPolicySchema.safeParse('güçlü1!şifre');
    expect(result.success).toBe(false);
  });

  it('küçük harf olmadan reddeder', () => {
    const result = passwordPolicySchema.safeParse('GÜÇLÜ1!ŞİFRE');
    expect(result.success).toBe(false);
  });

  it('rakam olmadan reddeder', () => {
    const result = passwordPolicySchema.safeParse('Güçlü!Şifre');
    expect(result.success).toBe(false);
  });

  it('özel karakter olmadan reddeder', () => {
    const result = passwordPolicySchema.safeParse('Guclu1Sifre');
    expect(result.success).toBe(false);
  });
});

describe('hashPassword & verifyPassword', () => {
  it('doğru şifreyi kabul eder', async () => {
    const hash = await hashPassword('Güçlü1!Şifre');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Güçlü1!Şifre')).toBe(true);
  });

  it('yanlış şifreyi reddeder', async () => {
    const hash = await hashPassword('Güçlü1!Şifre');
    expect(await verifyPassword(hash, 'Yanlış1!Şifre')).toBe(false);
  });

  it('politika ihlalinde PasswordPolicyError fırlatır', async () => {
    await expect(hashPassword('zayif')).rejects.toBeInstanceOf(PasswordPolicyError);
  });

  it('needsRehash farklı parametrelerle true döner', async () => {
    const hash = await hashPassword('Güçlü1!Şifre');
    expect(needsRehash(hash)).toBe(false);
  });
});

describe('generateSecureToken', () => {
  it('belirtilen byte uzunluğunda üretir', () => {
    const t1 = generateSecureToken(16);
    const t2 = generateSecureToken(32);
    expect(t1.length).toBeGreaterThan(0);
    expect(t2.length).toBeGreaterThan(t1.length);
    expect(/^[A-Za-z0-9_-]+$/.test(t1)).toBe(true);
  });

  it('her çağrıda farklı değer döner', () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) set.add(generateSecureToken(16));
    expect(set.size).toBe(50);
  });
});

describe('hashTokenAsync', () => {
  it('SHA-256 64 karakter hex döner', async () => {
    const h = await hashTokenAsync('merhaba');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('aynı girdi aynı çıktıyı verir', async () => {
    const a = await hashTokenAsync('abc');
    const b = await hashTokenAsync('abc');
    expect(a).toBe(b);
  });

  it('farklı girdi farklı çıktı verir', async () => {
    const a = await hashTokenAsync('abc');
    const b = await hashTokenAsync('abd');
    expect(a).not.toBe(b);
  });
});