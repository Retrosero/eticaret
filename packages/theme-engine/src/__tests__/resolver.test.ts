/**
 * Resolver unit testleri.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryThemeResolver } from '../resolver/index.js';
import type { ResolvedAssignment } from '../resolver/index.js';
import type { ThemeManifest } from '../types/index.js';

const modernManifest: ThemeManifest = {
  id: 'modern',
  name: 'Modern',
  description: 'Modern tema',
  author: 'eticart',
  version: '1.0.0',
  screenshots: [],
  tokens: { 'color.primary': '#1f6feb' },
  layouts: ['default'],
  blocks: ['hero'],
  variants: {
    header: ['classic'],
    footer: ['three-column'],
    productCard: ['vertical'],
    categoryPage: ['top-filter'],
    productDetailGallery: ['classic'],
  },
  minPlatformVersion: '5.0.0',
};

const classicManifest: ThemeManifest = {
  ...modernManifest,
  id: 'classic',
  name: 'Klasik',
  tokens: { 'color.primary': '#8b0000' },
};

function makeAssignment(overrides: Partial<ResolvedAssignment>): ResolvedAssignment {
  return {
    assignmentId: 'a1',
    tenantId: 't1',
    themeId: 'modern',
    version: '1.0.0',
    status: 'active',
    overrides: {},
    logoUrl: null,
    faviconUrl: null,
    headerMenu: {
      id: 'm1',
      tenantId: 't1',
      type: 'header',
      status: 'published',
      items: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    footerMenu: {
      id: 'm2',
      tenantId: 't1',
      type: 'footer',
      status: 'published',
      items: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    seo: {
      tenantId: 't1',
      titleTemplate: '%s',
      defaultTitle: 'Mağaza',
      defaultDescription: '',
      defaultOgImage: null,
      robots: 'index, follow',
      sitemapEnabled: true,
      canonicalBase: null,
      scripts: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    activatedAt: null,
    ...overrides,
  };
}

describe('theme-engine / resolver', () => {
  it('aktif temayı çözer', async () => {
    const resolver = new InMemoryThemeResolver(
      [modernManifest],
      [makeAssignment({})],
    );
    const result = await resolver.resolve('t1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.manifest.id).toBe('modern');
      expect(result.theme.tokens['color.primary']).toBe('#1f6feb');
    }
  });

  it('tenant override uygulanır', async () => {
    const resolver = new InMemoryThemeResolver(
      [modernManifest],
      [
        makeAssignment({
          overrides: { 'color.primary': '#ff0000' },
        }),
      ],
    );
    const result = await resolver.resolve('t1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.tokens['color.primary']).toBe('#ff0000');
    }
  });

  it('atanmamış tenant not-found döner', async () => {
    const resolver = new InMemoryThemeResolver([modernManifest], []);
    const result = await resolver.resolve('unknown');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-found');
  });

  it('draft atamayı resolveDraft ile çözer', async () => {
    const resolver = new InMemoryThemeResolver(
      [modernManifest, classicManifest],
      [makeAssignment({ status: 'draft', themeId: 'classic' })],
    );
    const result = await resolver.resolveDraft('t1', 'a1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.manifest.id).toBe('classic');
    }
  });

  it('manifest uyumsuz ise incompatible döner', async () => {
    const futureManifest = { ...modernManifest, minPlatformVersion: '99.0.0' };
    const resolver = new InMemoryThemeResolver(
      [futureManifest],
      [makeAssignment({})],
    );
    const result = await resolver.resolve('t1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('incompatible');
  });
});