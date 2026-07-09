/**
 * Design token modülü unit testleri.
 */

import { describe, it, expect } from 'vitest';
import {
  tokenKeyToCssVar,
  cssVarToTokenKey,
  tokensToCssVariables,
  applyTokenOverrides,
  sanitizeCssValue,
  validateTokenOverrides,
} from '../tokens/index.js';

describe('theme-engine / tokens', () => {
  it('token anahtarını CSS değişkenine çevirir', () => {
    expect(tokenKeyToCssVar('color.primary')).toBe('--color-primary');
    expect(tokenKeyToCssVar('font.heading')).toBe('--font-heading');
    expect(tokenKeyToCssVar('spacing.scale')).toBe('--spacing-scale');
  });

  it('CSS değişkenini token anahtarına çevirir', () => {
    // CSS değişken adları tire kullanır; token anahtarı tire formuna dönüşür.
    expect(cssVarToTokenKey('--color-primary')).toBe('color-primary');
  });

  it('CSS değişken çıktısı üretir', () => {
    const css = tokensToCssVariables({
      'color.primary': '#1f6feb',
      'font.heading': 'Inter',
    });
    expect(css).toContain('--color-primary: #1f6feb;');
    expect(css).toContain('--font-heading: Inter;');
    expect(css.startsWith(':root {')).toBe(true);
  });

  it('CSS injection engellenir', () => {
    expect(sanitizeCssValue('#fff; }}</style>')).toBeNull();
    expect(sanitizeCssValue('red; background: url(javascript:alert(1))')).toBeNull();
    expect(sanitizeCssValue('@import url("evil.css")')).toBeNull();
    expect(sanitizeCssValue('rgba(0,0,0,0.1)')).toBe('rgba(0,0,0,0.1)');
    expect(sanitizeCssValue('#fff')).toBe('#fff');
  });

  it('token override uygulanır', () => {
    const base = { 'color.primary': '#000000', 'font.heading': 'Inter' };
    const overrides = { 'color.primary': '#ff0000' };
    const merged = applyTokenOverrides(base, overrides);
    expect(merged['color.primary']).toBe('#ff0000');
    expect(merged['font.heading']).toBe('Inter');
  });

  it('manifest dışı override kabul edilmez', () => {
    const base = { 'color.primary': '#000000' };
    const overrides = { 'color.unknown': '#ff0000' };
    const merged = applyTokenOverrides(base, overrides);
    expect(merged['color.unknown']).toBeUndefined();
  });

  it('tip uyumsuz override sayıya çevrilebilir', () => {
    const base = { 'spacing.base': 4 };
    const overrides = { 'spacing.base': '8' };
    const merged = applyTokenOverrides(base, overrides);
    expect(merged['spacing.base']).toBe(8);
  });

  it('güvensiz override hata döner', () => {
    const overrides = {
      'color.primary': 'red; background: url(javascript:alert(1))',
    };
    const errors = validateTokenOverrides(overrides);
    expect(errors.length).toBeGreaterThan(0);
  });
});