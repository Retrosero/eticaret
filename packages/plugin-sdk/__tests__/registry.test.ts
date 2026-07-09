/**
 * Plugin Registry — unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginRegistry, globalRegistry } from '../src/registry.js';
import type { PluginManifest, PluginContext } from '../src/types.js';

const testManifest: PluginManifest = {
  code: 'test-plugin',
  name: 'Test Plugin',
  description: 'Test',
  category: 'utility',
  version: '1.0.0',
  author: 'Test',
  license: 'MIT',
  eticartVersion: '1.0.0',
  slug: 'test',
  slots: [
    { type: 'payment.gateway', handler: 'payment' },
    { type: 'shipping.carrier', handler: 'shipping' },
  ],
  hooks: [
    { event: 'order.created', handler: 'onOrderCreated' },
  ],
  configSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
  ],
};

const testHandlers = {
  payment: vi.fn().mockResolvedValue({ ok: true }),
  shipping: vi.fn().mockResolvedValue({ ok: true }),
  onOrderCreated: vi.fn().mockResolvedValue({ continue: true }),
};

function makeCtx(tenantId = 't-1'): PluginContext {
  return {
    tenantId,
    pluginInstallId: 'install-1',
    config: { apiKey: 'test-key' },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new PluginRegistry();
  });

  describe('load() / unload()', () => {
    it('geçerli plugin yüklenir', () => {
      expect(() =>
        registry.load({
          manifest: testManifest,
          handlers: testHandlers,
        }),
      ).not.toThrow();
    });

    it('geçersiz code → hata', () => {
      expect(() =>
        registry.load({
          manifest: { ...testManifest, code: 'Invalid Code!' },
          handlers: testHandlers,
        }),
      ).toThrow(/code/);
    });

    it('geçersiz version → hata', () => {
      expect(() =>
        registry.load({
          manifest: { ...testManifest, version: 'not-semver' },
          handlers: testHandlers,
        }),
      ).toThrow(/version/);
    });

    it('slot yok → hata', () => {
      expect(() =>
        registry.load({
          manifest: { ...testManifest, slots: [] },
          handlers: testHandlers,
        }),
      ).toThrow(/slot/);
    });

    it('unload() kaldırır', () => {
      registry.load({ manifest: testManifest, handlers: testHandlers });
      expect(registry.unload('test-plugin')).toBe(true);
      expect(registry.get('test-plugin')).toBeNull();
    });
  });

  describe('install / enable / disable / uninstall', () => {
    beforeEach(() => {
      registry.load({ manifest: testManifest, handlers: testHandlers });
    });

    it('install → install kaydı oluşur', () => {
      const install = registry.install('t-1', 'test-plugin', { apiKey: 'k' });
      expect(install.enabled).toBe(true);
      expect(install.config.apiKey).toBe('k');
    });

    it('mevcut olmayan plugin install → hata', () => {
      expect(() => registry.install('t-1', 'nonexistent')).toThrow();
    });

    it('disable → enabled=false', () => {
      registry.install('t-1', 'test-plugin');
      const updated = registry.disable('t-1', 'test-plugin');
      expect(updated?.enabled).toBe(false);
    });

    it('enable → enabled=true', () => {
      registry.install('t-1', 'test-plugin');
      registry.disable('t-1', 'test-plugin');
      const updated = registry.enable('t-1', 'test-plugin');
      expect(updated?.enabled).toBe(true);
    });

    it('uninstall → install kaydı silinir', () => {
      registry.install('t-1', 'test-plugin');
      expect(registry.uninstall('t-1', 'test-plugin')).toBe(true);
      expect(registry.listForTenant('t-1')).toHaveLength(0);
    });

    it('listForTenant(enabledOnly=true) sadece aktifleri döner', () => {
      registry.install('t-1', 'test-plugin');
      registry.disable('t-1', 'test-plugin');
      expect(registry.listForTenant('t-1', true)).toHaveLength(0);
      expect(registry.listForTenant('t-1', false)).toHaveLength(1);
    });
  });

  describe('getSlotHandlers()', () => {
    it('priority sıralı handler listesi döner', () => {
      const m1 = { ...testManifest, code: 'p1', slots: [{ type: 'payment.gateway' as const, handler: 'h', priority: 20 }] };
      const m2 = { ...testManifest, code: 'p2', slots: [{ type: 'payment.gateway' as const, handler: 'h', priority: 10 }] };
      registry.load({ manifest: m1, handlers: { h: vi.fn() } });
      registry.load({ manifest: m2, handlers: { h: vi.fn() } });

      const handlers = registry.getSlotHandlers('payment.gateway');
      expect(handlers).toHaveLength(2);
      // p2 (priority 10) önce
      expect(handlers[0]?.pluginCode).toBe('p2');
    });

    it('olmayan slot tipi → boş array', () => {
      expect(registry.getSlotHandlers('nonexistent.slot')).toEqual([]);
    });
  });

  describe('emitHook()', () => {
    beforeEach(() => {
      registry.load({ manifest: testManifest, handlers: testHandlers });
      registry.install('t-1', 'test-plugin');
    });

    it('tüm aktif handler\'ları çağırır', async () => {
      const ctx = makeCtx('t-1');
      const { data, results } = await registry.emitHook(
        'order.created',
        { orderId: 'o-1' },
        ctx,
      );

      expect(testHandlers.onOrderCreated).toHaveBeenCalled();
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(data.orderId).toBe('o-1');
    });

    it('disable edilmiş plugin atlanır', async () => {
      registry.disable('t-1', 'test-plugin');
      const ctx = makeCtx('t-1');
      await registry.emitHook('order.created', {}, ctx);
      expect(testHandlers.onOrderCreated).not.toHaveBeenCalled();
    });

    it('continue: false → sonraki handler atlanır', async () => {
      const stopHandlers = {
        ...testHandlers,
        onOrderCreated: vi.fn().mockResolvedValue({ continue: false, data: { stopped: true } }),
      };
      registry.unload('test-plugin');
      registry.load({ manifest: testManifest, handlers: stopHandlers });
      registry.install('t-1', 'test-plugin');

      const ctx = makeCtx('t-1');
      const { data } = await registry.emitHook('order.created', { initial: true }, ctx);
      expect(data).toEqual({ stopped: true });
    });

    it('handler hatası yakalanır (graceful degradation)', async () => {
      const errorHandlers = {
        ...testHandlers,
        onOrderCreated: vi.fn().mockRejectedValue(new Error('Hook boom')),
      };
      registry.unload('test-plugin');
      registry.load({ manifest: testManifest, handlers: errorHandlers });
      registry.install('t-1', 'test-plugin');

      const ctx = makeCtx('t-1');
      const { results } = await registry.emitHook('order.created', {}, ctx);
      expect(results[0]?.error).toBe('Hook boom');
      expect(ctx.logger.error).toHaveBeenCalled();
    });
  });

  describe('Multi-tenant isolation', () => {
    beforeEach(() => {
      registry.load({ manifest: testManifest, handlers: testHandlers });
    });
    it('farklı tenantlar farklı install state\'lere sahip', () => {
      registry.install('t-1', 'test-plugin');
      registry.install('t-2', 'test-plugin', { apiKey: 'other' });
      registry.disable('t-1', 'test-plugin');

      expect(registry.listForTenant('t-1', true)).toHaveLength(0);
      expect(registry.listForTenant('t-2', true)).toHaveLength(1);
    });
  });

  describe('globalRegistry', () => {
    it('singleton — iki referans aynı', () => {
      const a = globalRegistry;
      const b = globalRegistry;
      expect(a).toBe(b);
    });
  });
});
