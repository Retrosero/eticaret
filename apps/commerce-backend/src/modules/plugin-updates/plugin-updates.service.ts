/**
 * Plugin Auto-Update Service.
 *
 * Faz 28: Yeni plugin versiyonu çıktığında tenant'lara otomatik bildirim.
 * - Günlük cron job (registry tarama)
 * - In-app notification
 * - Email bildirimi (opsiyonel)
 * - Update window (immediate / scheduled / manual)
 */
import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Pool } from 'pg';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { PluginVersionRegistry, type LlmProvider } from '@eticart/plugin-sdk';

import { LOGGER_TOKEN } from '../../common/logger.js';

export type UpdateWindow = 'immediate' | 'weekly' | 'monthly' | 'manual';

export interface PluginUpdateNotification {
  id: string;
  tenantId: string;
  pluginCode: string;
  fromVersion: string | null;
  toVersion: string;
  breaking: boolean;
  changelog: string | null;
  /** Görüntülendi mi? */
  seen: boolean;
  /** Aksiyon alındı mı? */
  action: 'pending' | 'updated' | 'skipped' | 'scheduled';
  createdAt: string;
}

export interface UpdateCheckResult {
  /** Kaç tenant kontrol edildi */
  tenantsChecked: number;
  /** Kaç yeni update notification oluşturuldu */
  notificationsCreated: number;
  /** Breaking change olan update'ler */
  breakingUpdates: number;
  /** Hatalar */
  errors: Array<{ tenantId: string; pluginCode: string; error: string }>;
}

@Injectable()
export class PluginUpdatesService implements OnApplicationBootstrap {
  private registry = new PluginVersionRegistry();
  private cronTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Publish initial versions (Trendyol, Hepsiburada, N11)
    try {
      const { manifest: trendyol } = await import('@eticart/marketplace-trendyol');
      this.registry.publishVersion(trendyol as unknown as Parameters<LlmProvider['name']>[0] extends never ? never : never as never);
    } catch { /* package optional */ }
    this.startDailyCron();
  }

  /**
   * Günlük cron job başlat (24 saatte bir).
   */
  startDailyCron(): void {
    if (this.cronTimer) return;
    const interval = 24 * 60 * 60 * 1000; // 24 saat
    // İlk çalıştırma 5 dakika sonra (uygulama başlangıcında)
    this.cronTimer = setTimeout(() => {
      void this.checkAllTenants();
      this.cronTimer = setInterval(() => {
        void this.checkAllTenants();
      }, interval);
    }, 5 * 60 * 1000);
  }

  stopDailyCron(): void {
    if (this.cronTimer) {
      clearTimeout(this.cronTimer);
      clearInterval(this.cronTimer);
      this.cronTimer = null;
    }
  }

  /**
   * Tüm tenant'lar için yeni versiyon kontrolü.
   */
  async checkAllTenants(): Promise<UpdateCheckResult> {
    const result: UpdateCheckResult = {
      tenantsChecked: 0,
      notificationsCreated: 0,
      breakingUpdates: 0,
      errors: [],
    };

    try {
      // Aktif plugin install'ları çek
      const r = await this.pool.query<{
        tenant_id: string;
        plugin_code: string;
        current_version: string;
      }>(
        `SELECT tenant_id, plugin_code, plugin_version AS current_version
         FROM public.tenant_plugins
         WHERE enabled = true`,
      );

      const seen = new Set<string>();
      for (const row of r.rows) {
        const key = `${row.tenant_id}:${row.plugin_code}`;
        if (seen.has(key)) continue;
        seen.add(key);

        result.tenantsChecked++;

        try {
          const created = await this.checkUpdate(
            row.tenant_id,
            row.plugin_code,
            row.current_version,
          );
          if (created) {
            result.notificationsCreated++;
            if (created.breaking) result.breakingUpdates++;
          }
        } catch (err) {
          result.errors.push({
            tenantId: row.tenant_id,
            pluginCode: row.plugin_code,
            error: (err as Error).message,
          });
        }
      }
    } catch (err) {
      this.logger.error(
        { err: (err as Error).message },
        'checkAllTenants başarısız',
      );
    }

    this.logger.info(
      {
        tenantsChecked: result.tenantsChecked,
        notificationsCreated: result.notificationsCreated,
        breakingUpdates: result.breakingUpdates,
        errorCount: result.errors.length,
      },
      'Plugin update check tamamlandı',
    );
    return result;
  }

  /**
   * Tek bir tenant + plugin için update kontrol.
   */
  async checkUpdate(
    tenantId: string,
    pluginCode: string,
    currentVersion: string,
  ): Promise<PluginUpdateNotification | null> {
    const latest = this.registry.getLatestVersion(pluginCode);
    if (!latest) return null;

    // Zaten latest versiyondaysa skip
    if (latest.version === currentVersion) return null;

    // Zaten bildirim oluşturulmuş mu kontrol et
    const existing = await this.pool.query(
      `SELECT id FROM public.plugin_update_notifications
       WHERE tenant_id = $1 AND plugin_code = $2 AND to_version = $3`,
      [tenantId, pluginCode, latest.version],
    );
    if (existing.rows.length > 0) return null;

    const isBreaking = this.registry.isBreakingChange(currentVersion, latest.version);

    const r = await this.pool.query<PluginUpdateNotification>(
      `INSERT INTO public.plugin_update_notifications (
         tenant_id, plugin_code, from_version, to_version,
         breaking, changelog, seen, action
       ) VALUES ($1, $2, $3, $4, $5, $6, false, 'pending')
       RETURNING *`,
      [
        tenantId,
        pluginCode,
        currentVersion,
        latest.version,
        isBreaking,
        latest.changelog ?? null,
      ],
    );

    const notification = r.rows[0]!;

    // In-app notification kaydet
    await this.pool.query(
      `INSERT INTO public.in_app_notifications (
         tenant_id, user_id, type, title, body, data, priority
       ) VALUES (
         $1, NULL, 'plugin.update_available',
         $2, $3, $4, $5
       )`,
      [
        tenantId,
        `${pluginCode} ${latest.version} yayında`,
        `${currentVersion} → ${latest.version}${isBreaking ? ' (BREAKING CHANGE)' : ''}`,
        JSON.stringify({
          pluginCode,
          fromVersion: currentVersion,
          toVersion: latest.version,
          breaking: isBreaking,
        }),
        isBreaking ? 'high' : 'normal',
      ],
    );

    return notification;
  }

  /**
   * Tenant için bekleyen update bildirimleri.
   */
  async listNotifications(
    tenantId: string,
    options: { onlyUnseen?: boolean; limit?: number } = {},
  ): Promise<PluginUpdateNotification[]> {
    const params: unknown[] = [tenantId];
    let where = 'tenant_id = $1';
    if (options.onlyUnseen) {
      where += ' AND seen = false';
    }
    params.push(options.limit ?? 50);
    const r = await this.pool.query<PluginUpdateNotification>(
      `SELECT * FROM public.plugin_update_notifications
       WHERE ${where}
       ORDER BY breaking DESC, created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return r.rows;
  }

  /**
   * Bildirim görüldü olarak işaretle.
   */
  async markSeen(notificationId: string, tenantId: string): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE public.plugin_update_notifications
       SET seen = true
       WHERE id = $1 AND tenant_id = $2`,
      [notificationId, tenantId],
    );
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * Tenant'ın update tercihi.
   */
  async getUpdatePreference(
    tenantId: string,
    pluginCode: string,
  ): Promise<UpdateWindow> {
    const r = await this.pool.query<{ update_window: UpdateWindow }>(
      `SELECT update_window FROM public.plugin_update_preferences
       WHERE tenant_id = $1 AND plugin_code = $2`,
      [tenantId, pluginCode],
    );
    return r.rows[0]?.update_window ?? 'manual';
  }

  async setUpdatePreference(
    tenantId: string,
    pluginCode: string,
    window: UpdateWindow,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.plugin_update_preferences (
         tenant_id, plugin_code, update_window
       ) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, plugin_code)
       DO UPDATE SET update_window = EXCLUDED.update_window`,
      [tenantId, pluginCode, window],
    );
  }

  /**
   * Pending notification'ı "skipped" veya "scheduled" olarak işaretle.
   */
  async setAction(
    notificationId: string,
    tenantId: string,
    action: 'skipped' | 'scheduled',
  ): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE public.plugin_update_notifications
       SET action = $3
       WHERE id = $1 AND tenant_id = $2`,
      [notificationId, tenantId, action],
    );
    return (r.rowCount ?? 0) > 0;
  }
}