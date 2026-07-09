/**
 * Görsel boyutlandırma testleri.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';

import { resizeImageBuffer, classifyMime, mimeFromFormat } from './index.js';

let testImage: Buffer;

beforeAll(async () => {
  // 800×600 kırmızı test görseli
  testImage = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 200, g: 0, b: 0 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
});

describe('resizeImageBuffer', () => {
  it('tüm varyantları üretir', async () => {
    const out = await resizeImageBuffer(testImage);
    const names = out.map((r) => r.name);
    expect(names).toEqual(['small', 'medium', 'large', 'original']);
  });

  it('boyutlar küçülür', async () => {
    const out = await resizeImageBuffer(testImage);
    const small = out.find((r) => r.name === 'small');
    const large = out.find((r) => r.name === 'large');
    expect(small?.width).toBeLessThanOrEqual(200);
    expect(large?.width).toBeLessThanOrEqual(1200);
  });

  it('mime doğru ayarlanır', async () => {
    const out = await resizeImageBuffer(testImage);
    expect(out[0]?.mime).toBe('image/webp');
  });
});

describe('classifyMime', () => {
  it('görsel', () => {
    expect(classifyMime('image/jpeg')).toBe('image');
    expect(classifyMime('image/png')).toBe('image');
  });
  it('video', () => {
    expect(classifyMime('video/mp4')).toBe('video');
  });
  it('document', () => {
    expect(classifyMime('application/pdf')).toBe('document');
  });
  it('other', () => {
    expect(classifyMime('application/x-msdownload')).toBe('other');
  });
});

describe('mimeFromFormat', () => {
  it('webp', () => {
    expect(mimeFromFormat('webp')).toBe('image/webp');
  });
});
