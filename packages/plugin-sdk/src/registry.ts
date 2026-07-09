/**
 * Plugin Registry — in-memory plugin yönetimi.
 *
 * Per-process plugin listesi. Production'da DB'den yüklenir.
 * Her plugin için:
 *   - manifest (metadata)
 *   - handler'lar (slot + hook callbacks)
 *   - install (tenant bazlı aktif/pasif)
 */
import type {
  PluginManifest,
  PluginSlot,
  PluginHook,
  PluginContext,
  HookEvent,
  HookResult,
} from './types.js';

/** Loaded plugin (code → instance). */
export interface LoadedPlugin<T = unknown> {
  manifest: PluginManifest;
  /** Plugin'in export ettiği tüm handler'lar (slot + hook) */
  handlers: Record<string, (...args: unknown[]) => unknown>;
  /** Plugin options (opsiyonel) */
  options?: T;
}

/** Tenant bazlı plugin install durumu. */
export interface PluginInstall {
  pluginCode: string;
  tenantId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  installedAt: string;
  updatedAt: string;
}

export class PluginRegistry {
  /** code → loaded plugin */
  private readonly plugins = new Map<string, LoadedPlugin>();
  /** tenantId → code → install state */
  private readonly installs = new Map<string, Map<string, PluginInstall>>();
  /** event → list of (pluginCode, handlerName) */
  private readonly hookIndex = new Map<
    string,
    Array<{ pluginCode: string; handlerName: string; priority: number }>
  >();
  /** slotType → list of (pluginCode, handlerName) */
  private readonly slotIndex = new Map<
    string,
    Array<{ pluginCode: string; handlerName: string; priority: number }>
  >();

  /**
   * Plugin'i registry'ye yükle.
   */
  load<T>(plugin: LoadedPlugin<T>): void {
    const m = plugin.manifest;
    if (!m.code || !/^[a-z0-9-]+$/.test(m.code)) {
      throw new Error('Plugin manifest: code zorunlu ve küçük harf/rakam/tire');
    }
    if (!m.name || m.name.length > 100) {
      throw new Error('Plugin manifest: name 1-100 karakter');
    }
    if (!m.version || !/^\d+\.\d+\.\d+/.test(m.version)) {
      throw new Error('Plugin manifest: version semver olmalı (x.y.z)');
    }
    if (!m.slots || m.slots.length === 0) {
      throw new Error('Plugin manifest: en az 1 slot zorunlu');
    }

    this.plugins.set(plugin.manifest.code, plugin as LoadedPlugin);

    for (const slot of plugin.manifest.slots) {
      this.indexSlot(plugin.manifest.code, slot);
    }
    for (const hook of plugin.manifest.hooks ?? []) {
      this.indexHook(plugin.manifest.code, hook);
    }
  }

  /**
   * Plugin'i kaldır.
   */
  unload(code: string): boolean {
    const plugin = this.plugins.get(code);
    if (!plugin) return false;

    for (const slot of plugin.manifest.slots) {
      this.removeFromIndex(this.slotIndex, slot.type, code);
    }
    for (const hook of plugin.manifest.hooks ?? []) {
      this.removeFromIndex(this.hookIndex, hook.event, code);
    }

    this.plugins.delete(code);
    return true;
  }

  /**
   * Plugin'i tenant için yükle.
   */
  install(
    tenantId: string,
    pluginCode: string,
    config: Record<string, unknown> = {},
  ): PluginInstall {
    if (!this.plugins.has(pluginCode)) {
      throw new Error(`Plugin bulunamadı: ${pluginCode}`);
    }
    if (!this.installs.has(tenantId)) {
      this.installs.set(tenantId, new Map());
    }
    const install: PluginInstall = {
      pluginCode,
      tenantId,
      enabled: true,
      config,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.installs.get(tenantId)!.set(pluginCode, install);
    return install;
  }

  /**
   * Plugin'i tenant için devre dışı bırak.
   */
  disable(tenantId: string, pluginCode: string): PluginInstall | null {
    const install = this.installs.get(tenantId)?.get(pluginCode);
    if (!install) return null;
    install.enabled = false;
    install.updatedAt = new Date().toISOString();
    return install;
  }

  /**
   * Plugin'i tenant için etkinleştir.
   */
  enable(tenantId: string, pluginCode: string): PluginInstall | null {
    const install = this.installs.get(tenantId)?.get(pluginCode);
    if (!install) return null;
    install.enabled = true;
    install.updatedAt = new Date().toISOString();
    return install;
  }

  /**
   * Plugin'i tenant'tan kaldır.
   */
  uninstall(tenantId: string, pluginCode: string): boolean {
    return this.installs.get(tenantId)?.delete(pluginCode) ?? false;
  }

  /**
   * Tenant için yüklü plugin'ler.
   */
  listForTenant(tenantId: string, enabledOnly = false): PluginInstall[] {
    const all = Array.from(this.installs.get(tenantId)?.values() ?? []);
    return enabledOnly ? all.filter((i) => i.enabled) : all;
  }

  /**
   * Tüm yüklü plugin'ler (marketplace listesi için).
   */
  list(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Kod ile plugin getir.
   */
  get(code: string): LoadedPlugin | null {
    return this.plugins.get(code) ?? null;
  }

  /**
   * Slot için handler'lar (priority sıralı).
   */
  getSlotHandlers(
    slotType: string,
  ): Array<{ pluginCode: string; handler: (...args: unknown[]) => unknown }> {
    const entries = this.slotIndex.get(slotType) ?? [];
    return entries
      .sort((a, b) => a.priority - b.priority)
      .map((e) => {
        const plugin = this.plugins.get(e.pluginCode);
        const handler = plugin?.handlers[e.handlerName];
        if (!plugin || !handler) return null;
        return { pluginCode: e.pluginCode, handler };
      })
      .filter(
        (
          x,
        ): x is {
          pluginCode: string;
          handler: (...args: unknown[]) => unknown;
        } => x !== null,
      );
  }

  /**
   * Hook tetikle — tüm handler'ları çağır.
   */
  async emitHook<T>(
    event: string,
    data: T,
    ctx: PluginContext,
  ): Promise<{ data: T; results: HookResult[] }> {
    const entries = this.hookIndex.get(event) ?? [];
    const sorted = [...entries].sort((a, b) => a.priority - b.priority);
    const results: HookResult[] = [];
    let currentData: T = data;

    for (const entry of sorted) {
      const install = this.installs.get(ctx.tenantId)?.get(entry.pluginCode);
      if (install && !install.enabled) continue;

      const plugin = this.plugins.get(entry.pluginCode);
      const handler = plugin?.handlers[entry.handlerName];
      if (!plugin || !handler) continue;

      try {
        const hookEvent: HookEvent<T> = {
          event,
          tenantId: ctx.tenantId,
          data: currentData,
          timestamp: new Date().toISOString(),
        };
        const result = (await handler(hookEvent, ctx)) as HookResult;
        if (result?.data !== undefined) {
          currentData = result.data as T;
        }
        results.push(result ?? { continue: true });
        if (result && result.continue === false) break;
      } catch (err) {
        ctx.logger.error(
          `Hook error: ${event}@${entry.pluginCode}.${entry.handlerName}: ${(err as Error).message}`,
        );
        results.push({ continue: true, error: (err as Error).message });
      }
    }

    return { data: currentData, results };
  }

  // -------------------------------------------------------------------
  // Dahili
  // -------------------------------------------------------------------

  private indexSlot(pluginCode: string, slot: PluginSlot): void {
    if (!this.slotIndex.has(slot.type)) {
      this.slotIndex.set(slot.type, []);
    }
    this.slotIndex.get(slot.type)!.push({
      pluginCode,
      handlerName: slot.handler,
      priority: slot.priority ?? 100,
    });
  }

  private indexHook(pluginCode: string, hook: PluginHook): void {
    if (!this.hookIndex.has(hook.event)) {
      this.hookIndex.set(hook.event, []);
    }
    this.hookIndex.get(hook.event)!.push({
      pluginCode,
      handlerName: hook.handler,
      priority: hook.priority ?? 100,
    });
  }

  private removeFromIndex<K extends string>(
    index: Map<
      K,
      Array<{ pluginCode: string; handlerName: string; priority: number }>
    >,
    key: K,
    pluginCode: string,
  ): void {
    const list = index.get(key);
    if (!list) return;
    const filtered = list.filter((e) => e.pluginCode !== pluginCode);
    if (filtered.length === 0) {
      index.delete(key);
    } else {
      index.set(key, filtered);
    }
  }
}

/** Global registry (singleton). */
export const globalRegistry = new PluginRegistry();
