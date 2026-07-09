/**
 * Edge Cache — Redis-backed cache for region-local hot data.
 *
 * Kullanım:
 * - Ürün listesi (TTL: 60s)
 * - Kategori ağacı (TTL: 1 saat)
 * - Storefront ayarları (TTL: 5 dk)
 * - Tenant branding (TTL: 5 dk)
 *
 * Region-local: Her region kendi Redis'ine yazar, failover için
 * replicated cache opsiyonel.
 */

export interface CacheConfig {
  /** Default TTL (saniye) */
  defaultTtlSeconds: number;
  /** Key prefix (region-isolated) */
  keyPrefix: string;
  /** Negative cache TTL (404 için) */
  negativeTtlSeconds: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  defaultTtlSeconds: 300, // 5 dakika
  keyPrefix: 'eticart:cache',
  negativeTtlSeconds: 60,
};

export interface CacheStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Pattern delete (tenant tüm cache temizle). */
  delPattern(pattern: string): Promise<number>;
  /** TTL yenile. */
  expire(key: string, ttlSeconds: number): Promise<boolean>;
}

/**
 * In-memory cache (development/test için).
 * Production'da RedisCache kullanılır.
 */
export class InMemoryCache implements CacheStore {
  private store = new Map<string, { value: unknown; expiresAt: number }>();
  private hits = 0;
  private misses = 0;

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delPattern(pattern: string): Promise<number> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    let count = 0;
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + ttlSeconds * 1000;
    return true;
  }

  /** Stats */
  getStats(): { hits: number; misses: number; keys: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      keys: this.store.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  clear(): void {
    this.store.clear();
  }
}

// ───────────────────────────────────────────────────────────
// CACHE KEY BUILDER
// ───────────────────────────────────────────────────────────

export class CacheKeyBuilder {
  constructor(private readonly config: CacheConfig = DEFAULT_CACHE_CONFIG) {}

  /**
   * Region-scoped key: "eticart:cache:tr-ist:tenant:abc123:products:list"
   */
  build(region: string, parts: string[]): string {
    return [this.config.keyPrefix, region, ...parts].join(':');
  }

  /**
   * Tenant cache pattern (silme için).
   */
  tenantPattern(region: string, tenantId: string): string {
    return `${this.config.keyPrefix}:${region}:tenant:${tenantId}:*`;
  }
}

// ───────────────────────────────────────────────────────────
// CACHE-ASIDE HELPER
// ───────────────────────────────────────────────────────────

export async function cacheAside<T>(
  store: CacheStore,
  key: string,
  loader: () => Promise<T>,
  ttlSeconds?: number,
): Promise<T> {
  const cached = await store.get<T>(key);
  if (cached !== null) return cached;
  const value = await loader();
  await store.set(key, value, ttlSeconds);
  return value;
}

// ───────────────────────────────────────────────────────────
// CDN CACHE HEADERS
// ───────────────────────────────────────────────────────────

/**
 * HTTP Cache-Control header üret.
 * Storefront için CDN-friendly, API için no-cache.
 */
export function cacheControlHeader(
  type: 'public' | 'private' | 'no-store',
  options?: { maxAge?: number; sMaxAge?: number; staleWhileRevalidate?: number },
): string {
  switch (type) {
    case 'public':
      return [
        'public',
        `max-age=${options?.maxAge ?? 0}`,
        options?.sMaxAge !== undefined ? `s-maxage=${options.sMaxAge}` : '',
        options?.staleWhileRevalidate !== undefined
          ? `stale-while-revalidate=${options.staleWhileRevalidate}`
          : '',
      ]
        .filter(Boolean)
        .join(', ');
    case 'private':
      return 'private, max-age=0, no-cache';
    case 'no-store':
      return 'no-store, max-age=0';
  }
}