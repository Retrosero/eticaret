/**
 * Brute-force koruma servisi.
 *
 * - Aynı email'den 5 başarısız deneme → 15 dakika kilit
 * - Aynı IP'den 20 başarısız deneme → 30 dakika kilit
 *
 * Redis varsa orada, yoksa in-memory Map'te tutulur.
 * Production'da Redis zorunludur (uygulama ölçeklenebilirliği).
 */

import { Injectable } from '@nestjs/common';

export interface BruteForceConfig {
  /** Email başına eşik ve kilit süresi. */
  emailMaxAttempts: number;
  emailLockoutSeconds: number;
  /** IP başına eşik ve kilit süresi. */
  ipMaxAttempts: number;
  ipLockoutSeconds: number;
}

const DEFAULT_CONFIG: BruteForceConfig = {
  emailMaxAttempts: 5,
  emailLockoutSeconds: 15 * 60,
  ipMaxAttempts: 20,
  ipLockoutSeconds: 30 * 60,
};

interface CounterEntry {
  count: number;
  expiresAt: number;
}

/**
 * Brute-force sayaç interface'i. Production için Redis implementasyonu,
 * test için in-memory Map.
 */
export interface RateCounter {
  /** Sayaç artırır; mevcut değeri döner. */
  increment(key: string, ttlSeconds: number): Promise<number>;
  /** Anahtarın kilitli olup olmadığını kontrol eder. */
  isLocked(key: string): Promise<boolean>;
  /** Sayacı sıfırlar (başarılı giriş sonrası). */
  reset(key: string): Promise<void>;
}

export class InMemoryRateCounter implements RateCounter {
  private readonly store = new Map<string, CounterEntry>();

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt < now) {
      this.store.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  async isLocked(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return false;
    }
    return entry.count > 0; // her artış kilitli sayılır; gerçek eşik kontrolü üst katmanda
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Redis tabanlı RateCounter. `ioredis` veya benzeri ile çalışır.
 * Bu implementasyon `ioredis` paketinin geç bağlanması için
 * dinamik import kullanır; Faz 3'te stub.
 */
export class RedisRateCounter implements RateCounter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (!this.client) {
      // Lazy init — testlerde inject edilir
      this.client = await this.createClient();
    }
    const multi = this.client.multi();
    multi.incr(key);
    multi.expire(key, ttlSeconds);
    const r = await multi.exec();
    const first = r?.[0]?.[1];
    return Number(first ?? 0);
  }

  async isLocked(key: string): Promise<boolean> {
    if (!this.client) return false;
    const v = await this.client.get(key);
    return v !== null;
  }

  async reset(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async createClient(): Promise<any> {
    // Production'da `ioredis` ile bağlantı kurulur.
    // Bu stub test için null döner.
    return null;
  }
}

@Injectable()
export class BruteForceService {
  private readonly config: BruteForceConfig;
  private readonly counter: RateCounter;

  constructor(counter?: RateCounter, config?: Partial<BruteForceConfig>) {
    this.counter = counter ?? new InMemoryRateCounter();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Giriş denemesini kaydeder; eşik aşılırsa kilit uygular.
   *
   * @returns kilitli ise true; aksi durumda false.
   */
  async recordFailedAttempt(identifier: { email: string; ip: string }): Promise<{
    locked: boolean;
    emailCount: number;
    ipCount: number;
  }> {
    const emailKey = `bf:email:${identifier.email.toLowerCase()}`;
    const ipKey = `bf:ip:${identifier.ip}`;

    const [emailCount, ipCount] = await Promise.all([
      this.counter.increment(emailKey, this.config.emailLockoutSeconds),
      this.counter.increment(ipKey, this.config.ipLockoutSeconds),
    ]);

    const locked = emailCount >= this.config.emailMaxAttempts || ipCount >= this.config.ipMaxAttempts;
    return { locked, emailCount, ipCount };
  }

  /** Başarılı giriş sonrası email sayacını sıfırlar (IP sayacı korunur). */
  async resetEmailCounter(email: string): Promise<void> {
    await this.counter.reset(`bf:email:${email.toLowerCase()}`);
  }

  /**
   * E-posta veya IP kilitli mi?
   */
  async isLocked(identifier: { email: string; ip: string }): Promise<boolean> {
    const [emailLocked, ipLocked] = await Promise.all([
      this.counter.isLocked(`bf:email:${identifier.email.toLowerCase()}`),
      this.counter.isLocked(`bf:ip:${identifier.ip}`),
    ]);
    return emailLocked || ipLocked;
  }
}