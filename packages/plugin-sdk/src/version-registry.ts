/**
 * Plugin Version Registry v2.
 *
 * Plugin versiyon yönetimi:
 * - Active version (tenant için şu an yüklü)
 * - Available versions (rollback için)
 * - Update history
 * - Breaking change detection
 * - Version lock (tenant'lar istediği versiyonu sabitleyebilir)
 */
import type { PluginManifestV2 } from './manifest.js';
import { compareSemver, isValidSemver } from './manifest.js';

// ───────────────────────────────────────────────────────────
// VERSION REGISTRY ENTRY
// ───────────────────────────────────────────────────────────

export interface PluginVersionEntry {
  pluginCode: string;
  version: string;
  manifest: PluginManifestV2;
  /** Tenant tarafından yüklenme tarihi */
  installedAt: string;
  /** Yükleyen (super admin / tenant owner) */
  installedBy: string;
  /** Aktif mi? (tenant için) */
  active: boolean;
  /** Health check sonucu */
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
  /** Son health check zamanı */
  healthCheckedAt?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ───────────────────────────────────────────────────────────
// UPDATE HISTORY
// ───────────────────────────────────────────────────────────

export interface PluginUpdateEvent {
  pluginCode: string;
  tenantId: string;
  fromVersion: string | null;       // null = ilk kurulum
  toVersion: string;
  reason: 'install' | 'update' | 'rollback' | 'reinstall';
  performedBy: string;
  /** Breaking change ise otomatik rollback için */
  breaking: boolean;
  /** Backup of previous version (rollback için) */
  backupManifest?: PluginManifestV2;
  timestamp: string;
}

// ───────────────────────────────────────────────────────────
// REGISTRY (in-memory + DB-backed mock)
// ───────────────────────────────────────────────────────────

export class PluginVersionRegistry {
  private tenantPlugins = new Map<string, PluginVersionEntry[]>(); // tenantId → versions[]
  private globalVersions = new Map<string, PluginManifestV2[]>();    // pluginCode → all versions
  private updateHistory: PluginUpdateEvent[] = [];

  // ─── GLOBAL CATALOG (all available versions) ───

  /**
   * Plugin versiyonunu global kataloğa ekle.
   */
  publishVersion(manifest: PluginManifestV2): void {
    if (!isValidSemver(manifest.version)) {
      throw new Error(`Geçersiz semver: ${manifest.version}`);
    }
    const versions = this.globalVersions.get(manifest.code) ?? [];
    if (versions.some((v) => v.version === manifest.version)) {
      throw new Error(`Versiyon zaten yayında: ${manifest.code}@${manifest.version}`);
    }
    versions.push(manifest);
    versions.sort((a, b) => compareSemver(b.version, a.version)); // DESC
    this.globalVersions.set(manifest.code, versions);
  }

  /**
   * Plugin'in tüm yayınlanmış versiyonları (DESC).
   */
  listVersions(pluginCode: string): PluginManifestV2[] {
    return [...(this.globalVersions.get(pluginCode) ?? [])];
  }

  /**
   * Plugin'in en son versiyonu.
   */
  getLatestVersion(pluginCode: string): PluginManifestV2 | null {
    const versions = this.globalVersions.get(pluginCode);
    return versions?.[0] ?? null;
  }

  /**
   * Belirli bir versiyon.
   */
  getVersion(pluginCode: string, version: string): PluginManifestV2 | null {
    return (
      this.globalVersions.get(pluginCode)?.find((v) => v.version === version) ?? null
    );
  }

  // ─── TENANT INSTALLS ───

  /**
   * Plugin'i tenant için kur.
   */
  installForTenant(
    tenantId: string,
    manifest: PluginManifestV2,
    performedBy: string,
  ): PluginVersionEntry {
    const tenantVersions = this.tenantPlugins.get(tenantId) ?? [];

    // Aynı versiyon zaten yüklü mü?
    const existing = tenantVersions.find(
      (e) => e.pluginCode === manifest.code && e.version === manifest.version,
    );
    if (existing) {
      throw new Error(
        `Plugin zaten yüklü: ${manifest.code}@${manifest.version} (tenant: ${tenantId})`,
      );
    }

    // Tenant'ta başka bir versiyon aktif mi? → deaktive et
    for (const entry of tenantVersions) {
      if (entry.pluginCode === manifest.code && entry.active) {
        entry.active = false;
      }
    }

    const entry: PluginVersionEntry = {
      pluginCode: manifest.code,
      version: manifest.version,
      manifest,
      installedAt: new Date().toISOString(),
      installedBy: performedBy,
      active: true,
      healthStatus: 'healthy',
      healthCheckedAt: new Date().toISOString(),
    };

    tenantVersions.push(entry);
    this.tenantPlugins.set(tenantId, tenantVersions);

    // History
    this.updateHistory.push({
      pluginCode: manifest.code,
      tenantId,
      fromVersion: null,
      toVersion: manifest.version,
      reason: 'install',
      performedBy,
      breaking: manifest.breaking,
      timestamp: new Date().toISOString(),
    });

    return entry;
  }

  /**
   * Plugin'i tenant için güncelle (yeni versiyon).
   * Breaking change ise otomatik rollback öner.
   */
  updateForTenant(
    tenantId: string,
    pluginCode: string,
    targetVersion: string,
    performedBy: string,
  ): {
    entry: PluginVersionEntry;
    breaking: boolean;
    rollbackRecommended: boolean;
    previousVersion: string | null;
    newVersion: string;
  } {
    const targetManifest = this.getVersion(pluginCode, targetVersion);
    if (!targetManifest) {
      throw new Error(`Versiyon bulunamadı: ${pluginCode}@${targetVersion}`);
    }

    const tenantVersions = this.tenantPlugins.get(tenantId) ?? [];
    const activeEntry = tenantVersions.find(
      (e) => e.pluginCode === pluginCode && e.active,
    );
    const previousVersion = activeEntry?.version ?? null;

    // Breaking change kontrolü
    const breaking =
      targetManifest.breaking ||
      (previousVersion !== null &&
        this.isBreakingChange(
          activeEntry!.manifest.version,
          targetManifest.version,
        ));

    // Active deaktive et
    if (activeEntry) {
      activeEntry.active = false;
    }

    // Yeni entry oluştur
    const newEntry: PluginVersionEntry = {
      pluginCode,
      version: targetManifest.version,
      manifest: targetManifest,
      installedAt: new Date().toISOString(),
      installedBy: performedBy,
      active: true,
      healthStatus: 'healthy',
      healthCheckedAt: new Date().toISOString(),
      metadata: breaking ? { previousVersion, breakingChange: true } : { previousVersion },
    };

    tenantVersions.push(newEntry);
    this.tenantPlugins.set(tenantId, tenantVersions);

    // History
    this.updateHistory.push({
      pluginCode,
      tenantId,
      fromVersion: previousVersion,
      toVersion: targetManifest.version,
      reason: 'update',
      performedBy,
      breaking,
      backupManifest: activeEntry?.manifest,
      timestamp: new Date().toISOString(),
    });

    return {
      entry: newEntry,
      breaking,
      rollbackRecommended: breaking,
      previousVersion,
      newVersion: targetManifest.version,
    };
  }

  /**
   * Plugin'i önceki versiyona rollback et.
   */
  rollback(
    tenantId: string,
    pluginCode: string,
    targetVersion: string,
    performedBy: string,
  ): PluginVersionEntry {
    const targetManifest = this.getVersion(pluginCode, targetVersion);
    if (!targetManifest) {
      throw new Error(`Versiyon bulunamadı: ${pluginCode}@${targetVersion}`);
    }

    const tenantVersions = this.tenantPlugins.get(tenantId) ?? [];
    const activeEntry = tenantVersions.find(
      (e) => e.pluginCode === pluginCode && e.active,
    );

    if (!activeEntry) {
      throw new Error(`Plugin aktif değil: ${pluginCode}`);
    }

    if (activeEntry.version === targetVersion) {
      throw new Error(`Zaten bu versiyonda: ${targetVersion}`);
    }

    activeEntry.active = false;
    const newEntry: PluginVersionEntry = {
      pluginCode,
      version: targetVersion,
      manifest: targetManifest,
      installedAt: new Date().toISOString(),
      installedBy: performedBy,
      active: true,
      healthStatus: 'healthy',
      healthCheckedAt: new Date().toISOString(),
      metadata: { rolledBackFrom: activeEntry.version },
    };

    tenantVersions.push(newEntry);
    this.tenantPlugins.set(tenantId, tenantVersions);

    this.updateHistory.push({
      pluginCode,
      tenantId,
      fromVersion: activeEntry.version,
      toVersion: targetVersion,
      reason: 'rollback',
      performedBy,
      breaking: false,
      timestamp: new Date().toISOString(),
    });

    return newEntry;
  }

  /**
   * Tenant için tüm plugin versiyonları.
   */
  listTenantVersions(tenantId: string): PluginVersionEntry[] {
    return [...(this.tenantPlugins.get(tenantId) ?? [])];
  }

  /**
   * Tenant için aktif plugin versiyonu.
   */
  getActiveVersion(tenantId: string, pluginCode: string): PluginVersionEntry | null {
    return (
      this.tenantPlugins.get(tenantId)?.find(
        (e) => e.pluginCode === pluginCode && e.active,
      ) ?? null
    );
  }

  /**
   * Update history (son N event).
   */
  getUpdateHistory(tenantId?: string, limit = 50): PluginUpdateEvent[] {
    let events = this.updateHistory;
    if (tenantId) {
      events = events.filter((e) => e.tenantId === tenantId);
    }
    return events.slice(-limit).reverse();
  }

  /**
   * Health check güncelle.
   */
  setHealth(
    tenantId: string,
    pluginCode: string,
    status: 'healthy' | 'degraded' | 'unhealthy',
  ): void {
    const entry = this.getActiveVersion(tenantId, pluginCode);
    if (entry) {
      entry.healthStatus = status;
      entry.healthCheckedAt = new Date().toISOString();
    }
  }

  // ─── BREAKING CHANGE DETECTION ───

  /**
   * İki versiyon arasında breaking change var mı?
   * Semver major bump = breaking (default).
   * manifest.breaking = true = breaking (override).
   */
  isBreakingChange(fromVersion: string, toVersion: string): boolean {
    if (!isValidSemver(fromVersion) || !isValidSemver(toVersion)) return true;
    const [fromMajor] = fromVersion.split('.');
    const [toMajor] = toVersion.split('.');
    return fromMajor !== toMajor;
  }
}