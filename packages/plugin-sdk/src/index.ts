/**
 * @eticart/plugin-sdk — Plugin geliştirme SDK.
 *
 * Faz 23 ile eklenenler:
 * - Manifest v2 (semver + capability + permission)
 * - Sandbox runtime (timeout + memory + rate limit)
 * - Version registry (rollback + update history)
 */
export * from './types.js';
export * from './registry.js';
export * from './manifest.js';
export * from './sandbox.js';
export * from './version-registry.js';

/** Plugin geliştirici yardımcıları. */
export const PluginHelpers = {
  /**
   * Manifest doğrula (development'ta) — v2 schema.
   */
  validateManifestV2(manifest: unknown): {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!manifest || typeof manifest !== 'object') {
      return { valid: false, errors: ['manifest object olmalı'] };
    }
    const m = manifest as Record<string, unknown>;

    // Code
    if (!m['code'] || !/^eticart-plugin-[a-z0-9-]+$/.test(m['code'] as string)) {
      errors.push('code: "eticart-plugin-..." prefix zorunlu');
    }
    // Name
    if (!m['name'] || typeof m['name'] !== 'string') errors.push('name zorunlu');
    // Version
    if (!m['version'] || !/^\d+\.\d+\.\d+/.test(m['version'] as string)) {
      errors.push('version: semver (x.y.z) zorunlu');
    }
    // Engine version
    if (!m['eticartVersion']) {
      errors.push('eticartVersion zorunlu (örn. "^1.5.0")');
    }
    // Slots
    if (!Array.isArray(m['slots']) || m['slots'].length === 0) {
      errors.push('slots: en az 1 slot zorunlu');
    }
    // v2 fields
    if (!m['capabilities'] || !Array.isArray(m['capabilities'])) {
      warnings.push('capabilities tanımlı değil (sandbox izni yok)');
    }
    if (!m['permissions'] || !Array.isArray(m['permissions'])) {
      warnings.push('permissions tanımlı değil (tenant onayı yok)');
    }

    return errors.length === 0
      ? { valid: true, warnings: warnings.length > 0 ? warnings : undefined }
      : { valid: false, errors };
  },

  /**
   * Standard plugin loader helper (v2).
   */
  definePluginV2<T = unknown>(
    manifest: import('./manifest.js').PluginManifestV2,
    handlers: Record<string, (...args: unknown[]) => unknown>,
  ): import('./registry.js').LoadedPlugin<T> {
    // PluginManifestV2'deki options tipi string[]; LoadedPlugin ise PluginManifest bekliyor.
    // Basit tip köprüsü: v2 manifest'i PluginManifest formatına map et.
    const adapted = {
      ...manifest,
      configSchema: manifest.configSchema?.map((f) => ({
        ...f,
        options: f.options?.map((o) => ({ value: o, label: o })),
      })),
    } as unknown as import('./types.js').PluginManifest;
    return { manifest: adapted, handlers };
  },

  /**
   * Sandbox'lı handler wrapper.
   */
  sandboxedHandler<Args extends unknown[], R>(
    handler: (...args: Args) => Promise<R> | R,
  ): (...args: Args) => Promise<R> {
    return async (...args: Args) => handler(...args);
  },
};