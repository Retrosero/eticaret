/**
 * Plugin Service — unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@eticart/config';
import { PluginService } from '../plugin.service.js';
import { globalRegistry, type PluginManifest } from '@eticart/plugin-sdk';

const mockPool: any = {
  query: vi.fn(),
};
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const testManifest: PluginManifest = {
  code: 'test-plugin-1',
  name: 'Test Plugin',
  description: 'Test plugin',
  category: 'utility',
  version: '1.0.0',
  author: 'Test',
  license: 'MIT',
  eticartVersion: '1.0.0',
  slug: 'test-plugin-1',
  slots: [{ type: 'marketplace.adapter', handler: 'adapter' }],
  configSchema: [
    { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    { key: 'secret', label: 'Secret', type: 'password', required: true },
  ],
};

const testHandlers: any = {
  adapter: {
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'OK' }),
  },
};

describe('PluginService', () => {
  let service: PluginService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPool.query.mockReset();
    // Registry'yi temizle
    for (const plugin of globalRegistry.list()) {
      globalRegistry.unload(plugin.manifest.code);
    }
    service = new PluginService(mockLogger, mockPool);
    await service.onApplicationBootstrap();
    globalRegistry.load({ manifest: testManifest, handlers: testHandlers });
  });

  describe('listMarketplace()', () => {
    it('tüm yüklü plugin\'leri döner', () => {
      const list = service.listMarketplace();
      expect(list.length).toBeGreaterThanOrEqual(1);
      const testPlugin = list.find((p) => p.code === 'test-plugin-1');
      expect(testPlugin).toBeDefined();
      expect(testPlugin?.name).toBe('Test Plugin');
      expect(testPlugin?.category).toBe('utility');
    });
  });

  describe('getMarketplacePlugin()', () => {
    it('mevcut plugin detayını döner', () => {
      const plugin = service.getMarketplacePlugin('test-plugin-1') as any;
      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('Test Plugin');
      expect(plugin.configSchema).toBeDefined();
    });

    it('olmayan plugin → null', () => {
      const plugin = service.getMarketplacePlugin('nonexistent');
      expect(plugin).toBeNull();
    });
  });

  describe('install()', () => {
    it('başarılı install', () => {
      const result = service.install('t-1', 'test-plugin-1', {
        apiKey: 'k',
        secret: 's',
      });
      expect(result.ok).toBe(true);
      expect(result.code).toBe('test-plugin-1');
      expect(result.enabled).toBe(true);
    });

    it('olmayan plugin → 404', () => {
      expect(() => service.install('t-1', 'nonexistent', {})).toThrow(ApiError);
    });

    it('eksik zorunlu config alanı → 422', () => {
      expect(() => service.install('t-1', 'test-plugin-1', {})).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });
  });

  describe('configure()', () => {
    beforeEach(() => {
      service.install('t-1', 'test-plugin-1', { apiKey: 'k', secret: 's' });
    });

    it('config günceller', () => {
      const result = service.configure('t-1', 'test-plugin-1', { apiKey: 'new-k' });
      expect(result.ok).toBe(true);
    });

    it('yüklü olmayan plugin → 404', () => {
      expect(() => service.configure('t-1', 'nonexistent', {})).toThrow(ApiError);
    });
  });

  describe('enable/disable/uninstall', () => {
    beforeEach(() => {
      service.install('t-1', 'test-plugin-1', { apiKey: 'k', secret: 's' });
    });

    it('disable → enabled=false', () => {
      const result = service.disable('t-1', 'test-plugin-1');
      expect(result?.enabled).toBe(false);
    });

    it('enable → enabled=true', () => {
      service.disable('t-1', 'test-plugin-1');
      const result = service.enable('t-1', 'test-plugin-1');
      expect(result?.enabled).toBe(true);
    });

    it('uninstall → kaldırılır', () => {
      const result = service.uninstall('t-1', 'test-plugin-1');
      expect(result.ok).toBe(true);
    });
  });

  describe('listInstalled()', () => {
    it('maskelenmiş config döner (password gizli)', () => {
      service.install('t-1', 'test-plugin-1', {
        apiKey: 'my-key',
        secret: 'my-secret',
      });
      const list = service.listInstalled('t-1');
      const installed = list.find((i) => i.code === 'test-plugin-1');
      expect(installed).toBeDefined();
      const config = installed?.config as Record<string, unknown>;
      expect(config['secret']).toBe('••••••••');
    });
  });

  describe('testConnection()', () => {
    it('adapter testConnection çağrılır', async () => {
      service.install('t-1', 'test-plugin-1', { apiKey: 'k', secret: 's' });
      const result = await service.testConnection('t-1', 'test-plugin-1');
      expect(result.success).toBe(true);
    });

    it('yüklü olmayan plugin → 404', async () => {
      await expect(
        service.testConnection('t-1', 'nonexistent'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
