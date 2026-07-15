import { describe, expect, it } from 'vitest';

import {
  getThemeDefinition,
  listRegisteredThemes,
  registerTheme,
  themeClass,
} from '../../../lib/theme/dispatcher';
import type { ProductCardProps } from '../../../lib/theme/product-card';
import type { ProductGalleryProps } from '../../../lib/theme/product-gallery';
import type { CategoryLayoutProps } from '../../../lib/theme/category-layout';

const Stub = () => null as unknown as JSX.Element;
const ProductStub = (_props: ProductCardProps) => null as unknown as JSX.Element;
const GalleryStub = (_props: ProductGalleryProps) => null as unknown as JSX.Element;
const CategoryStub = (_props: CategoryLayoutProps) => null as unknown as JSX.Element;

describe('storefront theme registry', () => {
  it('built-in temaları registry üzerinden listeler', () => {
    expect(listRegisteredThemes()).toEqual(['modern', 'classic']);
    expect(getThemeDefinition('modern').id).toBe('modern');
    expect(getThemeDefinition('classic').id).toBe('classic');
    expect(getThemeDefinition('modern').productCard).toBeDefined();
  });

  it('yeni tema switch/case değiştirmeden kaydedilebilir', () => {
    registerTheme({ id: 'test-theme', header: Stub, footer: Stub, productCard: ProductStub, productGallery: GalleryStub, categoryLayout: CategoryStub });
    expect(getThemeDefinition('test-theme').header).toBe(Stub);
    expect(listRegisteredThemes()).toContain('test-theme');
  });

  it('bilinmeyen tema güvenli olarak modern temaya düşer', () => {
    expect(getThemeDefinition('missing-theme').id).toBe('modern');
    expect(themeClass('classic')).toBe('theme-classic');
  });
});
