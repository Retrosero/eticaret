/**
 * Failover Manager — Region sağlık kontrolü ve failover mantığı.
 *
 * Health check:
 * - Her 30 saniyede bir region DB ping
 * - Latency > 500ms → degraded
 * - Connection refused / timeout → down
 *
 * Failover:
 * - down region'a giden istek → en yakın aktif region'a redirect
 * - Cache'lerde stale-while-revalidate kullanılır
 */
import type { RegionCode, RegionHealth } from './region.js';
import { REGIONS, ALL_REGION_CODES } from './region.js';

export interface HealthCheckResult {
  code: RegionCode;
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

export interface FailoverOptions {
  /** Health check interval (ms) */
  checkIntervalMs: number;
  /** Latency threshold (ms) — üstü degraded */
  degradedThresholdMs: number;
  /** Failover timeout (ms) — beklenen cevap süresi */
  failoverTimeoutMs: number;
}

export const DEFAULT_FAILOVER_OPTIONS: FailoverOptions = {
  checkIntervalMs: 30_000,
  degradedThresholdMs: 500,
  failoverTimeoutMs: 3_000,
};

export type RegionHealthMap = Map<RegionCode, RegionHealth>;

export class FailoverManager {
  private health: RegionHealthMap = new Map();
  private options: FailoverOptions;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(options: Partial<FailoverOptions> = {}) {
    this.options = { ...DEFAULT_FAILOVER_OPTIONS, ...options };
    // Initial health: tüm region'lar 'active' olarak başla
    for (const code of ALL_REGION_CODES) {
      this.health.set(code, {
        code,
        status: 'active',
        latencyMs: 0,
        lastCheckedAt: new Date().toISOString(),
        activeReplicas: REGIONS[code].dbReplicas.length,
        cpuLoad: 0,
      });
    }
  }

  /**
   * Mevcut sağlık durumunu al.
   */
  getHealth(): RegionHealthMap {
    return new Map(this.health);
  }

  /**
   * Bir region'ın şu anki durumunu al.
   */
  getRegionHealth(code: RegionCode): RegionHealth | undefined {
    return this.health.get(code);
  }

  /**
   * Region'ı "down" olarak işaretle (manual).
   */
  markDown(code: RegionCode, _reason?: string): void {
    const current = this.health.get(code);
    if (current) {
      this.health.set(code, {
        ...current,
        status: 'down',
        lastCheckedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Region'ı "active" geri getir.
   */
  markActive(code: RegionCode): void {
    const current = this.health.get(code);
    if (current) {
      this.health.set(code, {
        ...current,
        status: 'active',
        lastCheckedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Tek bir region için health check (DB ping).
   */
  async checkRegion(code: RegionCode): Promise<HealthCheckResult> {
    const region = REGIONS[code];
    const start = Date.now();
    try {
      // Production'da: pg pool connect + SELECT 1
      // Burada simulated: başarılı varsayalım
      await this.simulatePing(region.dbPrimary);
      const latencyMs = Date.now() - start;

      const status = latencyMs > this.options.degradedThresholdMs ? 'degraded' : 'active';
      this.health.set(code, {
        code,
        status,
        latencyMs,
        lastCheckedAt: new Date().toISOString(),
        activeReplicas: region.dbReplicas.length,
        cpuLoad: 0,
      });

      return { code, healthy: true, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - start;
      this.health.set(code, {
        code,
        status: 'down',
        latencyMs,
        lastCheckedAt: new Date().toISOString(),
        activeReplicas: 0,
        cpuLoad: 0,
      });
      return {
        code,
        healthy: false,
        latencyMs,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Tüm region'ları check et.
   */
  async checkAll(): Promise<HealthCheckResult[]> {
    return Promise.all(ALL_REGION_CODES.map((c) => this.checkRegion(c)));
  }

  /**
   * Otomatik health check başlat.
   */
  startHealthChecks(pingFn?: (dbUrl: string) => Promise<void>): void {
    if (this.checkTimer) return;
    const ping = pingFn ?? this.simulatePing.bind(this);
    this.checkTimer = setInterval(async () => {
      for (const code of ALL_REGION_CODES) {
        const region = REGIONS[code];
        const start = Date.now();
        try {
          await ping(region.dbPrimary);
          const latencyMs = Date.now() - start;
          const status =
            latencyMs > this.options.degradedThresholdMs ? 'degraded' : 'active';
          this.health.set(code, {
            code,
            status,
            latencyMs,
            lastCheckedAt: new Date().toISOString(),
            activeReplicas: region.dbReplicas.length,
            cpuLoad: 0,
          });
        } catch {
          this.health.set(code, {
            code,
            status: 'down',
            latencyMs: 0,
            lastCheckedAt: new Date().toISOString(),
            activeReplicas: 0,
            cpuLoad: 0,
          });
        }
      }
    }, this.options.checkIntervalMs);
  }

  /**
   * Health check'leri durdur.
   */
  stopHealthChecks(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Down region için failover target seç.
   */
  selectFailoverTarget(downRegion: RegionCode): RegionCode | null {
    const candidates = ALL_REGION_CODES
      .filter((c) => c !== downRegion)
      .map((c) => ({ code: c, health: this.health.get(c) }))
      .filter((c) => c.health?.status === 'active')
      .sort((a, b) => (a.health?.latencyMs ?? 0) - (b.health?.latencyMs ?? 0));

    return candidates[0]?.code ?? null;
  }

  /**
   * Tüm region'lar down ise en düşük latency'li degraded region'ı seç.
   */
  selectEmergencyTarget(): RegionCode | null {
    const candidates = ALL_REGION_CODES
      .map((c) => ({ code: c, health: this.health.get(c) }))
      .filter((c) => c.health?.status !== 'down')
      .sort((a, b) => (a.health?.latencyMs ?? 0) - (b.health?.latencyMs ?? 0));
    return candidates[0]?.code ?? null;
  }

  /**
   * Simulated ping (test/dev için).
   */
  private async simulatePing(_dbUrl: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 5));
  }
}