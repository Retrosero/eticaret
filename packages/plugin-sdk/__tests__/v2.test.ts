/**
 * Plugin Manifest v2 + Sandbox + Version Registry tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  isValidSemver,
  compareSemver,
  parseEngineVersion,
  isEngineCompatible,
  type PluginManifestV2,
  PluginVersionRegistry,
  PluginRateLimiter,
  createSandboxContext,
  runInSandbox,
  assertCapability,
  assertPermission,
  assertNetworkAllowed,
  SandboxCapabilityError,
  SandboxPermissionError,
  PluginHelpers,
} from '../src/index.js';

// ───────────────────────────────────────────────────────────
// SEMVER
// ───────────────────────────────────────────────────────────

describe('Semver', () => {
  it('valid semver', () => {
    expect(isValidSemver('1.0.0')).toBe(true);
    expect(isValidSemver('1.2.3')).toBe(true);
    expect(isValidSemver('0.0.1')).toBe(true);
    expect(isValidSemver('1.0.0-alpha')).toBe(true);
    expect(isValidSemver('1.0.0-beta.1')).toBe(true);
    expect(isValidSemver('2.10.0+build.123')).toBe(true);
  });

  it('invalid semver', () => {
    expect(isValidSemver('1.0')).toBe(false);
    expect(isValidSemver('v1.0.0')).toBe(false);
    expect(isValidSemver('1.0.0.0')).toBe(false);
    expect(isValidSemver('latest')).toBe(false);
  });

  it('compareSemver', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSemver('1.1.0', '1.0.0')).toBe(1);
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.0-beta')).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────
// ENGINE VERSION
// ───────────────────────────────────────────────────────────

describe('Engine Version', () => {
  it('parseEngineVersion — caret', () => {
    const r = parseEngineVersion('^1.5.0');
    expect(r.min).toBe('1.5.0');
    expect(r.max).toBe('2.0.0');
  });

  it('parseEngineVersion — tilde', () => {
    const r = parseEngineVersion('~1.5.0');
    expect(r.min).toBe('1.5.0');
    expect(r.max).toBe('1.6.0');
  });

  it('parseEngineVersion — range', () => {
    const r = parseEngineVersion('>=1.5.0 <2.0.0');
    expect(r.min).toBe('1.5.0');
    expect(r.max).toBe('2.0.0');
  });

  it('parseEngineVersion — only >=', () => {
    const r = parseEngineVersion('>=1.5.0');
    expect(r.min).toBe('1.5.0');
    expect(r.max).toBeUndefined();
  });

  it('isEngineCompatible — uyumlu', () => {
    expect(isEngineCompatible('^1.5.0', '1.5.0')).toBe(true);
    expect(isEngineCompatible('^1.5.0', '1.7.3')).toBe(true);
    expect(isEngineCompatible('~1.5.0', '1.5.5')).toBe(true);
    expect(isEngineCompatible('>=1.5.0', '2.0.0')).toBe(true);
  });

  it('isEngineCompatible — uyumsuz', () => {
    expect(isEngineCompatible('^1.5.0', '1.4.9')).toBe(false);
    expect(isEngineCompatible('^1.5.0', '2.0.0')).toBe(false);
    expect(isEngineCompatible('~1.5.0', '1.6.0')).toBe(false);
    expect(isEngineCompatible('>=1.5.0 <2.0.0', '2.0.0')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────
// SANDBOX
// ───────────────────────────────────────────────────────────

describe('Sandbox', () => {
  const baseCtx = createSandboxContext({
    pluginCode: 'eticart-plugin-test',
    pluginVersion: '1.0.0',
    tenantId: 'tenant-1',
    capabilities: ['network.http', 'db.read'],
    permissions: ['product.read'],
    config: { timeoutMs: 1000 },
  });

  describe('createSandboxContext', () => {
    it('doğru defaults', () => {
      expect(baseCtx.pluginCode).toBe('eticart-plugin-test');
      expect(baseCtx.capabilities.has('network.http')).toBe(true);
      expect(baseCtx.capabilities.has('network.https')).toBe(false);
      expect(baseCtx.permissions.has('product.read')).toBe(true);
      expect(baseCtx.config.timeoutMs).toBe(1000);
    });

    it('default config merge', () => {
      expect(baseCtx.config.memoryLimitBytes).toBe(128 * 1024 * 1024);
      expect(baseCtx.config.rateLimitPerMinute).toBe(60);
    });
  });

  describe('assertCapability', () => {
    it('var olan capability geçer', () => {
      expect(() => assertCapability(baseCtx, 'network.http')).not.toThrow();
      expect(() => assertCapability(baseCtx, 'db.read')).not.toThrow();
    });

    it('olmayan capability hata fırlatır', () => {
      expect(() => assertCapability(baseCtx, 'storage.write')).toThrow(SandboxCapabilityError);
    });
  });

  describe('assertPermission', () => {
    it('var olan permission geçer', () => {
      expect(() => assertPermission(baseCtx, 'product.read')).not.toThrow();
    });

    it('olmayan permission hata fırlatır', () => {
      expect(() => assertPermission(baseCtx, 'order.write')).toThrow(SandboxPermissionError);
    });
  });

  describe('assertNetworkAllowed', () => {
    it('allowlist boş → hepsi denied', () => {
      expect(() => assertNetworkAllowed(baseCtx, 'https://api.example.com')).toThrow();
    });

    it('allowlist\'te varsa geçer', () => {
      const ctx = createSandboxContext({
        pluginCode: 'p1',
        pluginVersion: '1.0.0',
        tenantId: 't1',
        capabilities: [],
        permissions: [],
        config: { networkAllowlist: ['*.example.com', 'api.trendyol.com'] },
      });
      expect(() => assertNetworkAllowed(ctx, 'https://api.example.com')).not.toThrow();
      expect(() => assertNetworkAllowed(ctx, 'https://api.trendyol.com')).not.toThrow();
      expect(() => assertNetworkAllowed(ctx, 'https://evil.com')).toThrow();
    });
  });

  describe('runInSandbox', () => {
    it('başarılı handler', async () => {
      const result = await runInSandbox(baseCtx, async () => ({ ok: true }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual({ ok: true });
      if (result.ok) expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('timeout — uzun çalışan handler', async () => {
      const ctx = createSandboxContext({
        pluginCode: 'p',
        pluginVersion: '1.0.0',
        tenantId: 't',
        capabilities: [],
        permissions: [],
        config: { timeoutMs: 100 },
      });
      const result = await runInSandbox(ctx, async () => {
        await new Promise((r) => setTimeout(r, 500));
        return 'too late';
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('TIMEOUT');
    });

    it('uncaught error', async () => {
      const result = await runInSandbox(baseCtx, async () => {
        throw new Error('boom');
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toBe('boom');
    });

    it('synchronous return', async () => {
      const result = await runInSandbox(baseCtx, () => 42);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(42);
    });
  });
});

// ───────────────────────────────────────────────────────────
// RATE LIMITER
// ───────────────────────────────────────────────────────────

describe('PluginRateLimiter', () => {
  it('initial tokens full', () => {
    const rl = new PluginRateLimiter(10);
    expect(rl.tokens('p1')).toBe(10);
  });

  it('consume tokens', () => {
    const rl = new PluginRateLimiter(5);
    expect(rl.isAllowed('p1')).toBe(true);
    expect(rl.tokens('p1')).toBe(4);
    expect(rl.isAllowed('p1')).toBe(true);
    expect(rl.tokens('p1')).toBe(3);
  });

  it('limit aşımı', () => {
    const rl = new PluginRateLimiter(2);
    expect(rl.isAllowed('p1')).toBe(true);
    expect(rl.isAllowed('p1')).toBe(true);
    expect(rl.isAllowed('p1')).toBe(false);
  });

  it('farklı pluginler ayrı bucket', () => {
    const rl = new PluginRateLimiter(1);
    expect(rl.isAllowed('p1')).toBe(true);
    expect(rl.isAllowed('p2')).toBe(true);
    expect(rl.isAllowed('p1')).toBe(false);
    expect(rl.isAllowed('p2')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────
// VERSION REGISTRY
// ───────────────────────────────────────────────────────────

function makeManifest(version: string, breaking = false): PluginManifestV2 {
  return {
    code: 'eticart-plugin-test',
    name: 'Test Plugin',
    description: 'A test plugin for unit tests',
    category: 'integration',
    version,
    eticartVersion: '^1.0.0',
    author: 'Test Author',
    license: 'MIT',
    slug: 'test-plugin',
    slots: [{ type: 'marketplace.adapter', handler: 'adapter' }],
    capabilities: ['network.http'],
    permissions: ['product.read'],
    breaking,
  };
}

describe('PluginVersionRegistry', () => {
  let registry: PluginVersionRegistry;

  beforeEach(() => {
    registry = new PluginVersionRegistry();
  });

  it('publish + listVersions', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    registry.publishVersion(makeManifest('1.1.0'));
    registry.publishVersion(makeManifest('2.0.0'));

    const versions = registry.listVersions('eticart-plugin-test');
    expect(versions).toHaveLength(3);
    expect(versions[0]?.version).toBe('2.0.0'); // DESC
    expect(versions[2]?.version).toBe('1.0.0');
  });

  it('duplicate version hata', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    expect(() => registry.publishVersion(makeManifest('1.0.0'))).toThrow();
  });

  it('invalid semver hata', () => {
    expect(() => registry.publishVersion(makeManifest('not-semver'))).toThrow();
  });

  it('getLatestVersion', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    registry.publishVersion(makeManifest('2.5.0'));
    expect(registry.getLatestVersion('eticart-plugin-test')?.version).toBe('2.5.0');
  });

  it('installForTenant', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    const entry = registry.installForTenant(
      'tenant-1',
      makeManifest('1.0.0'),
      'admin@eticart.com.tr',
    );
    expect(entry.active).toBe(true);
    expect(entry.installedBy).toBe('admin@eticart.com.tr');
    expect(registry.getActiveVersion('tenant-1', 'eticart-plugin-test')?.version).toBe('1.0.0');
  });

  it('install duplicate version hata', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    registry.installForTenant('tenant-1', makeManifest('1.0.0'), 'admin');
    expect(() => registry.installForTenant('tenant-1', makeManifest('1.0.0'), 'admin')).toThrow();
  });

  it('updateForTenant — minor bump OK', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    registry.publishVersion(makeManifest('1.1.0'));
    registry.installForTenant('tenant-1', makeManifest('1.0.0'), 'admin');

    const result = registry.updateForTenant('tenant-1', 'eticart-plugin-test', '1.1.0', 'admin');
    expect(result.breaking).toBe(false);
    expect(result.previousVersion).toBe('1.0.0');
    expect(result.newVersion).toBe('1.1.0');
    expect(registry.getActiveVersion('tenant-1', 'eticart-plugin-test')?.version).toBe('1.1.0');
  });

  it('updateForTenant — major bump breaking', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    registry.publishVersion(makeManifest('2.0.0'));
    registry.installForTenant('tenant-1', makeManifest('1.0.0'), 'admin');

    const result = registry.updateForTenant('tenant-1', 'eticart-plugin-test', '2.0.0', 'admin');
    expect(result.breaking).toBe(true);
    expect(result.rollbackRecommended).toBe(true);
  });

  it('rollback', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    registry.publishVersion(makeManifest('2.0.0'));
    registry.installForTenant('tenant-1', makeManifest('2.0.0'), 'admin');

    const entry = registry.rollback('tenant-1', 'eticart-plugin-test', '1.0.0', 'admin');
    expect(entry.version).toBe('1.0.0');
    expect(entry.metadata?.['rolledBackFrom']).toBe('2.0.0');
  });

  it('rollback aynı versiyona hata', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    registry.installForTenant('tenant-1', makeManifest('1.0.0'), 'admin');
    expect(() =>
      registry.rollback('tenant-1', 'eticart-plugin-test', '1.0.0', 'admin'),
    ).toThrow();
  });

  it('update history', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    registry.publishVersion(makeManifest('1.1.0'));
    registry.publishVersion(makeManifest('2.0.0'));
    registry.installForTenant('tenant-1', makeManifest('1.0.0'), 'admin');
    registry.updateForTenant('tenant-1', 'eticart-plugin-test', '1.1.0', 'admin');
    registry.updateForTenant('tenant-1', 'eticart-plugin-test', '2.0.0', 'admin');
    registry.rollback('tenant-1', 'eticart-plugin-test', '1.1.0', 'admin');

    const history = registry.getUpdateHistory('tenant-1');
    expect(history.length).toBeGreaterThanOrEqual(4);
    expect(history[0]?.reason).toBe('rollback');
  });

  it('isBreakingChange — major bump', () => {
    expect(registry.isBreakingChange('1.5.0', '2.0.0')).toBe(true);
    expect(registry.isBreakingChange('1.5.0', '1.6.0')).toBe(false);
    expect(registry.isBreakingChange('1.5.0', '1.5.1')).toBe(false);
  });

  it('health status update', () => {
    registry.publishVersion(makeManifest('1.0.0'));
    registry.installForTenant('tenant-1', makeManifest('1.0.0'), 'admin');
    registry.setHealth('tenant-1', 'eticart-plugin-test', 'degraded');
    expect(registry.getActiveVersion('tenant-1', 'eticart-plugin-test')?.healthStatus).toBe('degraded');
  });
});

// ───────────────────────────────────────────────────────────
// PLUGIN HELPERS
// ───────────────────────────────────────────────────────────

describe('PluginHelpers', () => {
  describe('validateManifestV2', () => {
    it('geçerli manifest', () => {
      const result = PluginHelpers.validateManifestV2(makeManifest('1.0.0'));
      expect(result.valid).toBe(true);
    });

    it('geçersiz code', () => {
      const m = { ...makeManifest('1.0.0'), code: 'invalid' };
      const result = PluginHelpers.validateManifestV2(m);
      expect(result.valid).toBe(false);
    });

    it('geçersiz version', () => {
      const m = { ...makeManifest('1.0.0'), version: 'bad' };
      const result = PluginHelpers.validateManifestV2(m);
      expect(result.valid).toBe(false);
    });

    it('capabilities/permissions yoksa warning', () => {
      const m = { ...makeManifest('1.0.0'), capabilities: undefined, permissions: undefined };
      const result = PluginHelpers.validateManifestV2(m);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
    });
  });
});