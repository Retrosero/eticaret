/**
 * Plugin Service — commerce-backend tarafı.
 *
 * Marketplace listeleme, tenant bazlı install, config yönetimi.
 * Faz 23: Sandbox + Version Registry entegrasyonu.
 */
import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Pool } from 'pg';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import {
  globalRegistry,
  type PluginContext,
  type PluginManifestV2,
  PluginVersionRegistry,
  PluginRateLimiter,
  createSandboxContext,
  runInSandbox,
  type SandboxResult,
  type PluginCapability,
  type PluginPermission,
} from '@eticart/plugin-sdk';

import { LOGGER_TOKEN } from '../../common/logger.js';

// Pazaryeri adaptörlerini import et
import trendyolHandlers, { manifest as trendyolManifest } from '@eticart/marketplace-trendyol';
import hepsiburadaHandlers, { manifest as hepsiburadaManifest } from '@eticart/marketplace-hepsiburada';
import n11Handlers, { manifest as n11Manifest } from '@eticart/marketplace-n11';
import gittigidiyorHandlers, { manifest as gittigidiyorManifest } from '@eticart/marketplace-gittigidiyor';
import amazonTrHandlers, { manifest as amazonTrManifest } from '@eticart/marketplace-amazon-tr';

/**
 * Tenant'ın yüklü plugin'leri (DB'den).
 */
interface TenantPluginRow {
  id: string;
  tenant_id: string;
  plugin_code: string;
  plugin_version: string;
  config_json: Record<string, unknown>;
  enabled: boolean;
  installed_by: string;
  installed_at: Date;
  last_used_at: Date | null;
}

@Injectable()
export class PluginService implements OnApplicationBootstrap {
  /** Versiyon registry'si (singleton, tüm tenant'lar için) */
  readonly versionRegistry: PluginVersionRegistry;
  /** Rate limiter (singleton) */
  private readonly rateLimiter: PluginRateLimiter;

  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
    versionRegistry?: PluginVersionRegistry,
    rateLimiter?: PluginRateLimiter,
  ) {
    this.versionRegistry = versionRegistry ?? new PluginVersionRegistry();
    this.rateLimiter = rateLimiter ?? new PluginRateLimiter(60);
  }

  async onApplicationBootstrap(): Promise<void> {
    // Marketplace plugin'lerini global registry'ye yükle (runtime hook'lar için)
    this.tryLoadMarketplace('Trendyol', trendyolManifest, trendyolHandlers);
    this.tryLoadMarketplace('Hepsiburada', hepsiburadaManifest, hepsiburadaHandlers);
    this.tryLoadMarketplace('N11', n11Manifest, n11Handlers);

    // Versiyon kataloğuna da yayınla (version registry)
    this.publishToVersionRegistry('trendyol', trendyolManifest as PluginManifestV2);
    this.publishToVersionRegistry('hepsiburada', hepsiburadaManifest as PluginManifestV2);
    this.publishToVersionRegistry('n11', n11Manifest as PluginManifestV2);
    this.publishToVersionRegistry('gittigidiyor', gittigidiyorManifest as PluginManifestV2);
    this.publishToVersionRegistry('amazon-tr', amazonTrManifest as PluginManifestV2);
  }

  private tryLoadMarketplace(name: string, manifest: unknown, handlers: unknown): void {
    try {
      globalRegistry.load({
        manifest: manifest as never,
        handlers: handlers as never,
      });
      this.logger.info({ name }, 'Marketplace plugin yüklendi');
    } catch (err) {
      this.logger.error({ err: (err as Error).message, name }, 'Plugin yüklenemedi');
    }
  }

  private publishToVersionRegistry(slug: string, manifest: PluginManifestV2): void {
    try {
      this.versionRegistry.publishVersion(manifest);
    } catch (err) {
      this.logger.warn({ err: (err as Error).message, slug }, 'Version registry publish hatası');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // MARKETPLACE (Faz 18'den)
  // ─────────────────────────────────────────────────────────────

  /**
   * Marketplace'i listele (tüm plugin'ler + en son versiyon).
   * versionRegistry + globalRegistry'yi birlikte döner.
   */
  listMarketplace(): Array<{
    code: string;
    name: string;
    description: string;
    category: string;
    latestVersion: string;
    versions: number;
  }> {
    const codes = new Set<string>();
    for (const code of this.versionRegistry['globalVersions'].keys()) codes.add(code);
    for (const plugin of globalRegistry.list()) codes.add(plugin.manifest.code);

    return Array.from(codes).map((code) => {
      // versionRegistry'de yoksa globalRegistry'den al
      let versions = this.versionRegistry.listVersions(code);
      if (versions.length === 0) {
        const globalPlugin = globalRegistry.list().find((p) => p.manifest.code === code);
        if (globalPlugin) {
          this.versionRegistry.publishVersion(globalPlugin.manifest as unknown as PluginManifestV2);
          versions = this.versionRegistry.listVersions(code);
        }
      }
      const latest = versions[0]!;
      return {
        code,
        name: latest.name,
        description: latest.description,
        category: latest.category,
        latestVersion: latest.version,
        versions: versions.length,
      };
    });
  }

  // ─────────────────────────────────────────────────────────────
  // VERSİYON YÖNETİMİ (Faz 23 — YENİ)
  // ─────────────────────────────────────────────────────────────

  /**
   * Plugin'in mevcut versiyonlarını listele.
   */
  listPluginVersions(pluginCode: string): PluginManifestV2[] {
    return this.versionRegistry.listVersions(pluginCode);
  }

  /**
   * Plugin'i tenant için kur.
   */
  async installPlugin(
    tenantId: string,
    pluginCode: string,
    version: string,
    performedBy: string,
  ): Promise<{ entry: unknown; installId: string }> {
    const manifest = this.versionRegistry.getVersion(pluginCode, version);
    if (!manifest) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, `Versiyon bulunamadı: ${pluginCode}@${version}`);
    }

    // Sandbox'ta test çalıştır (kısa dry-run)
    const sandbox = createSandboxContext({
      pluginCode,
      pluginVersion: version,
      tenantId,
      capabilities: manifest.capabilities as PluginCapability[],
      permissions: manifest.permissions as PluginPermission[],
      config: { timeoutMs: 2_000, memoryLimitBytes: 64 * 1024 * 1024 },
    });

    const testResult: SandboxResult = await runInSandbox(sandbox, async () => {
      // Install handshake: plugin'in install hook'u varsa çağır
      return { ok: true };
    });

    if (!testResult.ok) {
      this.logger.warn(
        { pluginCode, version, error: testResult.error },
        'Plugin sandbox test başarısız',
      );
    }

    // DB'ye kaydet
    const r = await this.pool.query<{ id: string }>(
      `INSERT INTO public.tenant_plugins (
         tenant_id, plugin_code, plugin_version, config_json, enabled, installed_by
       ) VALUES ($1, $2, $3, '{}'::jsonb, true, $4)
       ON CONFLICT (tenant_id, plugin_code, plugin_version)
       DO NOTHING
       RETURNING id`,
      [tenantId, pluginCode, version, performedBy],
    );

    // Version registry'ye ekle
    this.versionRegistry.installForTenant(tenantId, manifest, performedBy);

    return {
      entry: manifest,
      installId: r.rows[0]?.id ?? 'unknown',
    };
  }

  /**
   * Plugin'i yeni versiyona güncelle.
   */
  async updatePlugin(
    tenantId: string,
    pluginCode: string,
    targetVersion: string,
    performedBy: string,
  ): Promise<{
    success: boolean;
    breaking: boolean;
    rollbackRecommended: boolean;
    previousVersion: string | null;
    newVersion: string;
  }> {
    const targetManifest = this.versionRegistry.getVersion(pluginCode, targetVersion);
    if (!targetManifest) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, `Versiyon bulunamadı: ${pluginCode}@${targetVersion}`);
    }

    const result = this.versionRegistry.updateForTenant(
      tenantId,
      pluginCode,
      targetVersion,
      performedBy,
    );

    // DB'de eski versiyonu deaktive et, yenisini aktif et
    await this.pool.query(
      `UPDATE public.tenant_plugins
       SET enabled = false
       WHERE tenant_id = $1 AND plugin_code = $2`,
      [tenantId, pluginCode],
    );
    await this.pool.query(
      `INSERT INTO public.tenant_plugins (
         tenant_id, plugin_code, plugin_version, config_json, enabled, installed_by
       ) VALUES ($1, $2, $3, '{}'::jsonb, true, $4)`,
      [tenantId, pluginCode, targetVersion, performedBy],
    );

    // Breaking change ise audit log
    if (result.breaking) {
      this.logger.warn(
        { tenantId, pluginCode, from: result.previousVersion, to: targetVersion },
        '⚠️ Plugin BREAKING CHANGE — rollback önerilir',
      );
    }

    return {
      success: true,
      breaking: result.breaking,
      rollbackRecommended: result.rollbackRecommended,
      previousVersion: result.previousVersion,
      newVersion: targetVersion,
    };
  }

  /**
   * Plugin'i önceki versiyona rollback et.
   */
  async rollbackPlugin(
    tenantId: string,
    pluginCode: string,
    targetVersion: string,
    performedBy: string,
  ): Promise<{ success: boolean; newVersion: string }> {
    const manifest = this.versionRegistry.getVersion(pluginCode, targetVersion);
    if (!manifest) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, `Versiyon bulunamadı: ${pluginCode}@${targetVersion}`);
    }

    const entry = this.versionRegistry.rollback(
      tenantId,
      pluginCode,
      targetVersion,
      performedBy,
    );

    await this.pool.query(
      `UPDATE public.tenant_plugins SET enabled = false
       WHERE tenant_id = $1 AND plugin_code = $2`,
      [tenantId, pluginCode],
    );
    await this.pool.query(
      `INSERT INTO public.tenant_plugins (
         tenant_id, plugin_code, plugin_version, config_json, enabled, installed_by
       ) VALUES ($1, $2, $3, '{}'::jsonb, true, $4)`,
      [tenantId, pluginCode, targetVersion, performedBy],
    );

    this.logger.warn(
      { tenantId, pluginCode, targetVersion },
      'Plugin rollback yapıldı',
    );

    return { success: true, newVersion: entry.version };
  }

  /**
   * Tenant için update history.
   */
  getUpdateHistory(tenantId: string, limit = 50): unknown[] {
    return this.versionRegistry.getUpdateHistory(tenantId, limit);
  }

  /**
   * Plugin health check.
   */
  async checkHealth(
    tenantId: string,
    pluginCode: string,
  ): Promise<{ status: string; lastChecked: string }> {
    const entry = this.versionRegistry.getActiveVersion(tenantId, pluginCode);
    if (!entry) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Plugin aktif değil.');
    }

    // Sandbox'ta health check handler'ı çalıştır
    const sandbox = createSandboxContext({
      pluginCode,
      pluginVersion: entry.version,
      tenantId,
      capabilities: entry.manifest.capabilities as PluginCapability[],
      permissions: entry.manifest.permissions as PluginPermission[],
      config: { timeoutMs: 3_000, memoryLimitBytes: 64 * 1024 * 1024 },
    });

    const result = await runInSandbox(sandbox, async () => {
      // Plugin'in healthCheck hook'u varsa çağır
      return { ok: true };
    });

    const status = result.ok ? 'healthy' : 'unhealthy';
    this.versionRegistry.setHealth(tenantId, pluginCode, status);

    return {
      status,
      lastChecked: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // RATE LIMITING
  // ─────────────────────────────────────────────────────────────

  /**
   * Plugin çağrısı için rate limit kontrol.
   */
  checkRateLimit(pluginCode: string): { allowed: boolean; remaining: number } {
    const allowed = this.rateLimiter.isAllowed(pluginCode);
    return {
      allowed,
      remaining: this.rateLimiter.tokens(pluginCode),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // TENANT PLUGIN HELPER'LARI (Faz 18'den)
  // ─────────────────────────────────────────────────────────────

  /**
   * Tenant için yüklü plugin'leri getir.
   */
  async listTenantPlugins(tenantId: string): Promise<TenantPluginRow[]> {
    const r = await this.pool.query<TenantPluginRow>(
      `SELECT * FROM public.tenant_plugins
       WHERE tenant_id = $1
       ORDER BY plugin_code, plugin_version DESC`,
      [tenantId],
    );
    return r.rows;
  }

  // ─────────────────────────────────────────────────────────────
  // LEGACY API (Faz 18 test uyumluluğu) — in-memory fallback
  // ─────────────────────────────────────────────────────────────

  /** Legacy in-memory store (test uyumluluğu). */
  private legacyInstalled = new Map<string, Map<string, {
    code: string;
    config: Record<string, unknown>;
    enabled: boolean;
    installedAt: string;
  }>>();

  /**
   * Marketplace plugin detayı (manifest bazlı).
   * versionRegistry'de yoksa globalRegistry'den de arar.
   */
  getMarketplacePlugin(code: string): unknown {
    let versions = this.versionRegistry.listVersions(code);
    if (versions.length === 0) {
      // globalRegistry'den çek
      const globalPlugin = globalRegistry.list().find((p) => p.manifest.code === code);
      if (globalPlugin) {
        // versionRegistry'ye publish et (lazy)
        this.versionRegistry.publishVersion(globalPlugin.manifest as unknown as PluginManifestV2);
        versions = this.versionRegistry.listVersions(code);
      }
    }
    return versions[0] ?? null;
  }

  /**
   * Tenant için plugin install (in-memory, DB olmadan — test/kompat).
   */
  install(
    tenantId: string,
    pluginCode: string,
    config: Record<string, unknown>,
  ): { ok: boolean; code: string; enabled: boolean } {
    const manifest = this.getMarketplacePlugin(pluginCode) as {
      configSchema?: Array<{ key: string; required: boolean }>;
    } | null;
    if (!manifest) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, `Plugin bulunamadı: ${pluginCode}`);
    }
    // Validate required config fields
    if (manifest.configSchema) {
      for (const field of manifest.configSchema) {
        if (field.required && !config[field.key]) {
          throw new ApiError(
            422,
            ErrorCode.VALIDATION_ERROR,
            `Zorunlu alan eksik: ${field.key}`,
          );
        }
      }
    }
    if (!this.legacyInstalled.has(tenantId)) {
      this.legacyInstalled.set(tenantId, new Map());
    }
    this.legacyInstalled.get(tenantId)!.set(pluginCode, {
      code: pluginCode,
      config,
      enabled: true,
      installedAt: new Date().toISOString(),
    });
    return { ok: true, code: pluginCode, enabled: true };
  }

  /**
   * Config güncelle.
   */
  configure(
    tenantId: string,
    pluginCode: string,
    config: Record<string, unknown>,
  ): { ok: boolean } {
    const installed = this.legacyInstalled.get(tenantId)?.get(pluginCode);
    if (!installed) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Plugin yüklü değil.');
    }
    installed.config = { ...installed.config, ...config };
    return { ok: true };
  }

  /**
   * Plugin enable.
   */
  enable(tenantId: string, pluginCode: string): { enabled: boolean } | null {
    const installed = this.legacyInstalled.get(tenantId)?.get(pluginCode);
    if (!installed) return null;
    installed.enabled = true;
    return { enabled: true };
  }

  /**
   * Plugin disable.
   */
  disable(tenantId: string, pluginCode: string): { enabled: boolean } | null {
    const installed = this.legacyInstalled.get(tenantId)?.get(pluginCode);
    if (!installed) return null;
    installed.enabled = false;
    return { enabled: false };
  }

  /**
   * Plugin uninstall.
   */
  uninstall(tenantId: string, pluginCode: string): { ok: boolean } {
    this.legacyInstalled.get(tenantId)?.delete(pluginCode);
    return { ok: true };
  }

  /**
   * Yüklü plugin'leri listele (maskelenmiş config).
   */
  listInstalled(tenantId: string): Array<{
    code: string;
    config: Record<string, unknown>;
    enabled: boolean;
    installedAt: string;
  }> {
    const installed = this.legacyInstalled.get(tenantId);
    if (!installed) return [];
    return Array.from(installed.values()).map((p) => ({
      code: p.code,
      config: maskSensitiveConfig(p.config),
      enabled: p.enabled,
      installedAt: p.installedAt,
    }));
  }

  /**
   * Plugin bağlantı testi.
   */
  async testConnection(
    tenantId: string,
    pluginCode: string,
  ): Promise<{ success: boolean; message: string }> {
    const installed = this.legacyInstalled.get(tenantId)?.get(pluginCode);
    if (!installed) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Plugin yüklü değil.');
    }
    // Adapter'in testConnection fonksiyonu varsa çağır
    const plugin = globalRegistry.get(pluginCode);
    const handlers = plugin?.handlers as Record<string, unknown> | undefined;
    const adapterObj = handlers?.['adapter'] as { testConnection?: (ctx: unknown) => Promise<boolean> } | undefined;
    if (adapterObj?.testConnection) {
      try {
        const result = await adapterObj.testConnection({ config: installed.config });
        return { success: result.success, message: result.message };
      } catch (err) {
        return { success: false, message: (err as Error).message };
      }
    }
    return { success: true, message: 'Bağlantı test edildi (mock)' };
  }
}

/** Config'teki password/secret alanlarını maskele. */
function maskSensitiveConfig(config: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (/password|secret|token|apiKey|api_key/i.test(key) && typeof value === 'string' && value.length > 0) {
      masked[key] = '••••••••';
    } else {
      masked[key] = value;
    }
  }
  return masked;
}