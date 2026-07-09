/**
 * sanitize yardımcıları için birim testleri.
 */

import { describe, it, expect } from 'vitest';

import {
  sanitizeFilename,
  sanitizeLogicalPath,
  buildStorageKey,
} from './sanitize.js';

describe('sanitizeFilename', () => {
  it('Türkçe karakterleri ASCII karşılığına çevirir', () => {
    expect(sanitizeFilename('ürün fotoğrafı.jpg')).toBe('urun-fotografi.jpg');
    expect(sanitizeFilename('İSTANBUL.txt')).toBe('ISTANBUL.txt');
    expect(sanitizeFilename('şemsiye çanta.pdf')).toBe('semsiye-canta.pdf');
    expect(sanitizeFilename('güçlü ördek.mp4')).toBe('guclu-ordek.mp4');
  });

  it('path traversal ve özel karakterleri temizler', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeFilename('..\\..\\windows\\system32')).toBe('windows-system32');
    expect(sanitizeFilename('logo file 02.png')).toBe('logo-file-02.png');
    expect(sanitizeFilename('___dosya___adı___')).toBe('dosya-adi');
  });

  it('boş veya geçersiz girdi için "file" döner', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('   ')).toBe('file');
    expect(sanitizeFilename('\u0000\u0001\u0002')).toBe('file');
  });

  it('200 karakterden uzun girdiler kırpılır', () => {
    const long = 'a'.repeat(500);
    const out = sanitizeFilename(long + '.png');
    expect(out.length).toBeLessThanOrEqual(200);
  });
});

describe('sanitizeLogicalPath', () => {
  it('güvenli path üretir', () => {
    expect(sanitizeLogicalPath(['products', 'shoes', 'images'])).toBe(
      'products/shoes/images',
    );
  });

  it('forbidden segmentleri düşürür', () => {
    expect(sanitizeLogicalPath(['products', '..', 'shoes'])).toBe(
      'products/shoes',
    );
    expect(sanitizeLogicalPath(['', '', '.', 'data'])).toBe('data');
  });
});

describe('buildStorageKey', () => {
  it('tüm beklenen bileşenleri içerir', () => {
    const key = buildStorageKey('a1b2c3d4-1234', 'products/sku-1', 'cover.jpg');
    expect(key).toMatch(/^tenants\/a1b2c3d4-1234\/products\/sku-1\/cover\.jpg$/);
  });

  it('geçersiz tenant id reddedilir', () => {
    expect(() => buildStorageKey('evil/../', 'a', 'b')).toThrow();
    expect(() => buildStorageKey('x'.repeat(120), 'a', 'b')).toThrow();
  });
});
