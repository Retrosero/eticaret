import { describe, expect, it } from 'vitest';
import {
  getStorefrontBlock,
  supportedBlocksForTheme,
  supportedStorefrontBlocks,
} from '../../../lib/theme/block-registry';

describe('storefront block registry', () => {
  it('manifest bloklarının tamamı için renderer kaydı vardır', () => {
    expect(supportedStorefrontBlocks()).toContain('hero');
    expect(supportedStorefrontBlocks()).toContain('featured-products');
    expect(getStorefrontBlock('unknown-block')).toBeUndefined();
  });

  it('tema manifesti renderer olmayan blokları çalıştırılabilir listeden çıkarır', () => {
    const allowed = supportedBlocksForTheme({ blocks: ['hero', 'html'] } as never);
    expect(allowed.has('hero')).toBe(true);
    expect(allowed.has('html')).toBe(true);
    expect(allowed.has('faq')).toBe(false);
  });
});
