/**
 * Manifest modülü unit testleri.
 */

import { describe, it, expect } from 'vitest';
import {
  parseThemeManifest,
  safeParseThemeManifest,
  compareSemver,
  isMajorVersionChange,
  meetsMinPlatformVersion,
  THEME_BLOCK_TYPES,
} from '../manifest/index.js';
import type { ThemeManifest } from '../types/index.js';

const validManifest: ThemeManifest = {
  id: 'modern',
  name: 'Modern Mağaza',
  description: 'Büyük görseller, grid layout',
  author: 'eticart',
  version: '1.4.2',
  screenshots: ['https://cdn.example.com/modern-1.png'],
  tokens: {
    'color.primary': '#1f6feb',
    'color.background': '#ffffff',
    'font.heading': 'Inter, sans-serif',
    'spacing.scale': '4 8 12 16 24',
  },
  layouts: ['default', 'minimal'],
  blocks: ['hero', 'featured-products', 'faq'],
  variants: {
    header: ['mega-menu', 'classic'],
    footer: ['three-column', 'four-column'],
    productCard: ['horizontal', 'vertical'],
    categoryPage: ['sidebar-filter', 'top-filter'],
    productDetailGallery: ['carousel', 'zoom'],
  },
  minPlatformVersion: '5.0.0',
};

describe('theme-engine / manifest', () => {
  it('geçerli manifest parse edilir', () => {
    const parsed = parseThemeManifest(validManifest);
    expect(parsed.id).toBe('modern');
    expect(parsed.version).toBe('1.4.2');
  });

  it('geçersiz id reddedilir', () => {
    const invalid = { ...validManifest, id: 'Modern!' };
    const result = safeParseThemeManifest(invalid);
    expect(result.ok).toBe(false);
  });

  it('geçersiz semver reddedilir', () => {
    const invalid = { ...validManifest, version: '1.4' };
    const result = safeParseThemeManifest(invalid);
    expect(result.ok).toBe(false);
  });

  it('geçersiz hex renk reddedilir', () => {
    const invalid = {
      ...validManifest,
      tokens: { ...validManifest.tokens, 'color.primary': '#zzz', 'color.bg': 'tomato' },
    };
    const result = safeParseThemeManifest(invalid);
    // color-primary key i prefix'i color- ile başladığı için hex kontrolü tetiklenir;
    // #zzz geçerli hex değildir, dolayısıyla Zod hata vermelidir.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toMatch(/Geçersiz hex renk/);
    }
  });

  it('blok tipleri listesi 16 öğe içerir', () => {
    expect(THEME_BLOCK_TYPES).toHaveLength(16);
    expect(THEME_BLOCK_TYPES).toContain('hero');
    expect(THEME_BLOCK_TYPES).toContain('faq');
    expect(THEME_BLOCK_TYPES).toContain('countdown');
  });

  describe('semver', () => {
    it('doğru karşılaştırır', () => {
      expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
      expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
      expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
      expect(compareSemver('1.10.0', '1.2.0')).toBe(1);
    });

    it('major değişiklik tespiti', () => {
      expect(isMajorVersionChange('1.4.2', '2.0.0')).toBe(true);
      expect(isMajorVersionChange('1.4.2', '1.5.0')).toBe(false);
      expect(isMajorVersionChange('2.0.0', '1.99.99')).toBe(true);
    });

    it('minimum platform sürümü kontrolü', () => {
      expect(meetsMinPlatformVersion(validManifest, '5.0.0')).toBe(true);
      expect(meetsMinPlatformVersion(validManifest, '5.5.0')).toBe(true);
      expect(meetsMinPlatformVersion(validManifest, '4.9.0')).toBe(false);
    });
  });
});