/**
 * Plugin Sandbox — Güvenli runtime.
 *
 * Her plugin handler'ı izole bir context'te çalışır:
 * - Timeout (varsayılan 5s)
 * - Memory limit (varsayılan 128MB)
 * - Try/catch ile hata izolasyonu
 * - Rate limiting (opsiyonel)
 *
 * Production'da Node.js worker_threads veya VM2 + resourceLimits kullanılır.
 * MVP'de function-level isolation + timeout.
 */
import type { PluginCapability, PluginPermission } from './manifest.js';

// ───────────────────────────────────────────────────────────
// SANDBOX CONFIG
// ───────────────────────────────────────────────────────────

export interface SandboxConfig {
  /** Handler timeout (ms) */
  timeoutMs: number;
  /** Memory limit (bytes, 128MB default) */
  memoryLimitBytes: number;
  /** Rate limit: dakikada max çağrı */
  rateLimitPerMinute: number;
  /** Network egress allowlist (boş = izin yok) */
  networkAllowlist: string[];
  /** Console override (log izolasyonu) */
  captureLogs: boolean;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  timeoutMs: 5_000,
  memoryLimitBytes: 128 * 1024 * 1024,
  rateLimitPerMinute: 60,
  networkAllowlist: [],
  captureLogs: true,
};

// ───────────────────────────────────────────────────────────
// SANDBOX RESULT
// ───────────────────────────────────────────────────────────

export type SandboxResult<T = unknown> =
  | { ok: true; value: T; durationMs: number; memoryBytes?: number }
  | { ok: false; error: SandboxError; durationMs: number };

export interface SandboxError {
  code:
    | 'TIMEOUT'
    | 'MEMORY_LIMIT'
    | 'RATE_LIMIT'
    | 'NETWORK_DENIED'
    | 'PERMISSION_DENIED'
    | 'CAPABILITY_DENIED'
    | 'UNCAUGHT'
    | 'TIMER_FIRED';
  message: string;
  stack?: string;
  timestamp: string;
}

// ───────────────────────────────────────────────────────────
// SANDBOX CONTEXT
// ───────────────────────────────────────────────────────────

export interface SandboxContext {
  pluginCode: string;
  pluginVersion: string;
  tenantId: string;
  capabilities: Set<PluginCapability>;
  permissions: Set<PluginPermission>;
  config: SandboxConfig;
  /** Plugin metadata (debug için) */
  meta?: Record<string, unknown>;
}

/**
 * Sandbox context oluştur.
 */
export function createSandboxContext(
  opts: {
    pluginCode: string;
    pluginVersion: string;
    tenantId: string;
    capabilities: PluginCapability[];
    permissions: PluginPermission[];
    config?: Partial<SandboxConfig>;
    meta?: Record<string, unknown>;
  },
): SandboxContext {
  return {
    pluginCode: opts.pluginCode,
    pluginVersion: opts.pluginVersion,
    tenantId: opts.tenantId,
    capabilities: new Set(opts.capabilities),
    permissions: new Set(opts.permissions),
    config: { ...DEFAULT_SANDBOX_CONFIG, ...opts.config },
    meta: opts.meta,
  };
}

/**
 * Capability check.
 */
export function assertCapability(
  ctx: SandboxContext,
  cap: PluginCapability,
): void {
  if (!ctx.capabilities.has(cap)) {
    throw new SandboxCapabilityError(cap);
  }
}

/**
 * Permission check.
 */
export function assertPermission(
  ctx: SandboxContext,
  perm: PluginPermission,
): void {
  if (!ctx.permissions.has(perm)) {
    throw new SandboxPermissionError(perm);
  }
}

/**
 * Network allowlist check.
 */
export function assertNetworkAllowed(ctx: SandboxContext, url: string): void {
  if (ctx.config.networkAllowlist.length === 0) {
    throw new SandboxErrorImpl('NETWORK_DENIED', 'Network egress devre dışı.');
  }
  const allowed = ctx.config.networkAllowlist.some((pattern) => {
    // Tam eşleşme
    if (pattern === url) return true;
    // Wildcard (*.example.com) → domain suffix
    if (pattern.startsWith('*.')) {
      const domain = pattern.slice(2);
      // url içinde domain suffix'i ara
      try {
        const u = new URL(url);
        return u.hostname === domain || u.hostname.endsWith('.' + domain);
      } catch {
        return url.includes(domain);
      }
    }
    // Hostname-only match (pattern: "api.trendyol.com")
    try {
      const u = new URL(url);
      return u.hostname === pattern;
    } catch {
      return false;
    }
  });
  if (!allowed) {
    throw new SandboxErrorImpl('NETWORK_DENIED', `URL allowlist'te yok: ${url}`);
  }
}

// ───────────────────────────────────────────────────────────
// CUSTOM ERRORS
// ───────────────────────────────────────────────────────────

export class SandboxCapabilityError extends Error {
  readonly code = 'CAPABILITY_DENIED';
  constructor(public readonly capability: PluginCapability) {
    super(`Capability gerekli: ${capability}`);
    this.name = 'SandboxCapabilityError';
  }
}

export class SandboxPermissionError extends Error {
  readonly code = 'PERMISSION_DENIED';
  constructor(public readonly permission: PluginPermission) {
    super(`Permission gerekli: ${permission}`);
    this.name = 'SandboxPermissionError';
  }
}

export class SandboxErrorImpl extends Error {
  constructor(
    public readonly code: SandboxError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

// ───────────────────────────────────────────────────────────
// RUN HANDLER (timeout + isolation)
// ───────────────────────────────────────────────────────────

/**
 * Handler'ı sandbox içinde çalıştır.
 * - Timeout
 * - Try/catch izolasyon
 * - Promise.race ile timeout enforcement
 */
export async function runInSandbox<T = unknown>(
  ctx: SandboxContext,
  handler: (ctx: SandboxContext) => Promise<T> | T,
): Promise<SandboxResult<T>> {
  const start = Date.now();

  // Handler'ı çağır, timeout ile yarış
  let timer: NodeJS.Timeout | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new SandboxErrorImpl('TIMEOUT', `Handler timeout (${ctx.config.timeoutMs}ms)`));
      }, ctx.config.timeoutMs);
    });

    const result = await Promise.race([
      Promise.resolve()
        .then(() => handler(ctx))
        .catch((err) => {
          throw err;
        }),
      timeoutPromise,
    ]);

    if (timer) clearTimeout(timer);
    return {
      ok: true,
      value: result as T,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    const sandboxErr: SandboxError = {
      code: isSandboxError(err) ? err.code : 'UNCAUGHT',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    };
    return {
      ok: false,
      error: sandboxErr,
      durationMs: Date.now() - start,
    };
  }
}

function isSandboxError(err: unknown): err is SandboxErrorImpl {
  return err instanceof SandboxErrorImpl;
}

// ───────────────────────────────────────────────────────────
// RATE LIMITER
// ───────────────────────────────────────────────────────────

/**
 * In-memory rate limiter (token bucket).
 * Production'da Redis olmalı.
 */
export class PluginRateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(
    private readonly limitPerMinute: number,
  ) {}

  /**
   * İstek izinli mi?
   */
  isAllowed(pluginCode: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(pluginCode) ?? { tokens: this.limitPerMinute, lastRefill: now };
    const elapsed = now - bucket.lastRefill;
    const refill = (elapsed / 60_000) * this.limitPerMinute;
    bucket.tokens = Math.min(this.limitPerMinute, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(pluginCode, bucket);
      return true;
    }
    return false;
  }

  /**
   * Token sayısı (debug).
   */
  tokens(pluginCode: string): number {
    const bucket = this.buckets.get(pluginCode);
    if (!bucket) return this.limitPerMinute;
    return Math.floor(bucket.tokens);
  }
}