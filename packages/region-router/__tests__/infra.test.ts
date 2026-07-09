/**
 * Edge Cache + Failover + Tenant Residency tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryCache,
  CacheKeyBuilder,
  cacheAside,
  cacheControlHeader,
  FailoverManager,
  TenantResidencyManager,
  suggestRegionForCompliance,
  COMPLIANCE_REGION_MAP,
  type RegionCode,
} from '../src/index.js';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  describe('get/set', () => {
    it('set + get', async () => {
      await cache.set('key1', { a: 1 }, 60);
      const v = await cache.get<{ a: number }>('key1');
      expect(v).toEqual({ a: 1 });
    });

    it('miss → null', async () => {
      expect(await cache.get('nonexistent')).toBeNull();
    });

    it('TTL expire', async () => {
      await cache.set('key1', 'value', 0.05); // 50ms
      expect(await cache.get('key1')).toBe('value');
      await new Promise((r) => setTimeout(r, 100));
      expect(await cache.get('key1')).toBeNull();
    });
  });

  describe('del', () => {
    it('tek key sil', async () => {
      await cache.set('k1', 'v1');
      await cache.del('k1');
      expect(await cache.get('k1')).toBeNull();
    });
  });

  describe('delPattern', () => {
    it('wildcard pattern', async () => {
      await cache.set('tenant:1:products', 'a');
      await cache.set('tenant:1:orders', 'b');
      await cache.set('tenant:2:products', 'c');
      const count = await cache.delPattern('tenant:1:*');
      expect(count).toBe(2);
      expect(await cache.get('tenant:1:products')).toBeNull();
      expect(await cache.get('tenant:1:orders')).toBeNull();
      expect(await cache.get('tenant:2:products')).toBe('c');
    });
  });

  describe('expire', () => {
    it('TTL yenile', async () => {
      await cache.set('k1', 'v1', 1);
      const ok = await cache.expire('k1', 100);
      expect(ok).toBe(true);
      expect(await cache.get('k1')).toBe('v1');
    });

    it('olmayan key → false', async () => {
      expect(await cache.expire('nonexistent', 100)).toBe(false);
    });
  });

  describe('stats', () => {
    it('hit/miss tracking', async () => {
      await cache.set('k1', 'v1');
      await cache.get('k1'); // hit
      await cache.get('k2'); // miss
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.5);
    });
  });
});

describe('CacheKeyBuilder', () => {
  it('region-scoped key', () => {
    const builder = new CacheKeyBuilder();
    const key = builder.build('tr-ist', ['tenant', 'abc', 'products']);
    expect(key).toBe('eticart:cache:tr-ist:tenant:abc:products');
  });

  it('tenant pattern', () => {
    const builder = new CacheKeyBuilder();
    const pattern = builder.tenantPattern('tr-ist', 'tenant-1');
    expect(pattern).toBe('eticart:cache:tr-ist:tenant:tenant-1:*');
  });
});

describe('cacheAside()', () => {
  it('cache miss → loader çağrılır', async () => {
    const cache = new InMemoryCache();
    let loaderCalls = 0;
    const result = await cacheAside(
      cache,
      'k1',
      async () => {
        loaderCalls++;
        return 'value-from-loader';
      },
      60,
    );
    expect(result).toBe('value-from-loader');
    expect(loaderCalls).toBe(1);
  });

  it('cache hit → loader çağrılmaz', async () => {
    const cache = new InMemoryCache();
    await cache.set('k1', 'cached-value');
    let loaderCalls = 0;
    const result = await cacheAside(cache, 'k1', async () => {
      loaderCalls++;
      return 'value-from-loader';
    });
    expect(result).toBe('cached-value');
    expect(loaderCalls).toBe(0);
  });
});

describe('cacheControlHeader()', () => {
  it('public cache', () => {
    expect(cacheControlHeader('public', { maxAge: 60 })).toContain('public');
    expect(cacheControlHeader('public', { maxAge: 60 })).toContain('max-age=60');
  });

  it('public + s-maxage + swr', () => {
    const h = cacheControlHeader('public', {
      maxAge: 60,
      sMaxAge: 300,
      staleWhileRevalidate: 600,
    });
    expect(h).toContain('s-maxage=300');
    expect(h).toContain('stale-while-revalidate=600');
  });

  it('private', () => {
    expect(cacheControlHeader('private')).toBe('private, max-age=0, no-cache');
  });

  it('no-store', () => {
    expect(cacheControlHeader('no-store')).toBe('no-store, max-age=0');
  });
});

describe('FailoverManager', () => {
  let manager: FailoverManager;

  beforeEach(() => {
    manager = new FailoverManager({ checkIntervalMs: 100 });
  });

  it('başlangıçta tüm region\'lar active', () => {
    const health = manager.getHealth();
    expect(health.size).toBe(4);
    for (const h of health.values()) {
      expect(h.status).toBe('active');
    }
  });

  it('markDown / markActive', () => {
    manager.markDown('tr-ist');
    expect(manager.getRegionHealth('tr-ist')?.status).toBe('down');
    manager.markActive('tr-ist');
    expect(manager.getRegionHealth('tr-ist')?.status).toBe('active');
  });

  it('checkRegion başarılı', async () => {
    const r = await manager.checkRegion('tr-ist');
    expect(r.healthy).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('checkAll tüm region\'ları check eder', async () => {
    const results = await manager.checkAll();
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.healthy).toBe(true);
    }
  });

  it('selectFailoverTarget down region\'ı atlar', () => {
    manager.markDown('tr-ist');
    const target = manager.selectFailoverTarget('tr-ist');
    expect(target).toBeDefined();
    expect(target).not.toBe('tr-ist');
  });

  it('selectEmergencyTarget tüm down ise degraded seçer', () => {
    for (const code of ['tr-ist', 'eu-fra', 'us-east', 'apac-sin'] as RegionCode[]) {
      manager.markDown(code);
    }
    // Tüm region down → emergency target null
    expect(manager.selectEmergencyTarget()).toBeNull();
  });

  it('startHealthChecks + stopHealthChecks', () => {
    manager.startHealthChecks();
    expect((manager as any).checkTimer).not.toBeNull();
    manager.stopHealthChecks();
    expect((manager as any).checkTimer).toBeNull();
  });

  it('double start → ikinci start no-op', () => {
    manager.startHealthChecks();
    const timer1 = (manager as any).checkTimer;
    manager.startHealthChecks();
    const timer2 = (manager as any).checkTimer;
    expect(timer1).toBe(timer2);
    manager.stopHealthChecks();
  });
});

describe('Compliance Region Mapping', () => {
  it('KVKK → sadece TR', () => {
    expect(COMPLIANCE_REGION_MAP.kvkk).toEqual(['tr-ist']);
  });

  it('GDPR → EU veya TR', () => {
    expect(COMPLIANCE_REGION_MAP.gdpr).toContain('eu-fra');
    expect(COMPLIANCE_REGION_MAP.gdpr).toContain('tr-ist');
  });

  it('CCPA → US veya EU', () => {
    expect(COMPLIANCE_REGION_MAP.ccpa).toContain('us-east');
  });

  it('PDPA → APAC', () => {
    expect(COMPLIANCE_REGION_MAP.pdpa).toEqual(['apac-sin']);
  });

  it('suggestRegionForCompliance KVKK', () => {
    expect(suggestRegionForCompliance('kvkk', 'eu-fra')).toBe('tr-ist'); // eu-fra KVKK için uygun değil
    expect(suggestRegionForCompliance('kvkk')).toBe('tr-ist');
  });

  it('suggestRegionForCompliance GDPR', () => {
    expect(suggestRegionForCompliance('gdpr', 'eu-fra')).toBe('eu-fra');
    expect(suggestRegionForCompliance('gdpr', 'tr-ist')).toBe('tr-ist'); // TR de GDPR için uygun
  });

  it('suggestRegionForCompliance CCPA', () => {
    expect(suggestRegionForCompliance('ccpa', 'us-east')).toBe('us-east');
  });
});

describe('TenantResidencyManager', () => {
  const mgr = new TenantResidencyManager();

  it('create default residency', () => {
    const r = mgr.create('tenant-1', 'TR', 'kvkk');
    expect(r.primaryRegion).toBe('tr-ist');
    expect(r.compliance).toBe('kvkk');
    expect(r.dataProcessingConsent).toBe(false);
    expect(r.migrationHistory).toHaveLength(0);
  });

  it('preferred region kullanılır', () => {
    const r = mgr.create('tenant-1', 'DE', 'gdpr', 'eu-fra');
    expect(r.primaryRegion).toBe('eu-fra');
  });

  it('backup region önerilir', () => {
    const r = mgr.create('tenant-1', 'TR', 'kvkk');
    expect(r.backupRegion).toBe('eu-fra');
  });

  it('KVKK tenant eu-fra\'ya migrate edilemez', () => {
    const r = mgr.create('tenant-1', 'TR', 'kvkk');
    expect(() =>
      mgr.migrate(r, 'eu-fra', 'admin@eticart.com.tr', 'test'),
    ).toThrow(/uygun değil/);
  });

  it('GDPR tenant eu-fra\'ya migrate edilebilir', () => {
    // GDPR tenant başlangıçta TR'de, sonra eu-fra'ya migrate edilebilir
    const r = mgr.create('tenant-1', 'DE', 'gdpr', 'tr-ist');
    expect(r.primaryRegion).toBe('tr-ist');
    const updated = mgr.migrate(r, 'eu-fra', 'admin@eticart.com.tr', 'test reason');
    expect(updated.primaryRegion).toBe('eu-fra');
    expect(updated.backupRegion).toBe('tr-ist');
    expect(updated.migrationHistory).toHaveLength(1);
    expect(updated.migrationHistory[0]?.reason).toBe('test reason');
  });

  it('audit report', () => {
    const r = mgr.create('tenant-1', 'TR', 'kvkk');
    const updated = mgr.migrate(
      mgr.create('tenant-1', 'TR', 'kvkk'),
      'tr-ist',
      'admin',
      'noop',
    );
    const report = mgr.getAuditReport(updated);
    expect(report.tenantId).toBe('tenant-1');
    expect(report.currentRegion).toBe('tr-ist');
  });

  it('requiresDataResidency', () => {
    expect(mgr.requiresDataResidency('kvkk')).toBe(true);
    expect(mgr.requiresDataResidency('gdpr')).toBe(true);
    expect(mgr.requiresDataResidency('ccpa')).toBe(false);
    expect(mgr.requiresDataResidency('pdpa')).toBe(false);
  });
});

describe('RegionHelpers', () => {
  it('getActiveRegion', async () => {
    process.env['ETICART_REGION'] = 'us-east';
    const { RegionHelpers } = await import('../src/index.js');
    expect(RegionHelpers.getActiveRegion()).toBe('us-east');
    delete process.env['ETICART_REGION'];
  });

  it('getRegionHostname', async () => {
    const { RegionHelpers } = await import('../src/index.js');
    expect(RegionHelpers.getRegionHostname('tr-ist')).toBe('tr.eticart.com.tr');
    expect(RegionHelpers.getRegionHostname('eu-fra')).toBe('eu.eticart.com.tr');
    expect(RegionHelpers.getRegionHostname('us-east')).toBe('us.eticart.com.tr');
    expect(RegionHelpers.getRegionHostname('apac-sin')).toBe('apac.eticart.com.tr');
  });

  it('getRegionApiUrl', async () => {
    const { RegionHelpers } = await import('../src/index.js');
    expect(RegionHelpers.getRegionApiUrl('tr-ist')).toMatch(/^https:\/\/api-tr/);
    expect(RegionHelpers.getRegionApiUrl('eu-fra')).toMatch(/^https:\/\/api-eu/);
  });
});