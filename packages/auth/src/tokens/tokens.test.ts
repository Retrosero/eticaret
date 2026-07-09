/**
 * Refresh token rotation testleri — token reuse detection dahil.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueTokenPair,
  rotateRefreshToken,
  type RefreshTokenStore,
  type RefreshTokenRecord,
} from './index.js';

class InMemoryStore implements RefreshTokenStore {
  private records = new Map<string, RefreshTokenRecord>();

  async insert(
    record: Omit<RefreshTokenRecord, 'createdAt' | 'revokedAt' | 'replacedById'>,
  ): Promise<RefreshTokenRecord> {
    const r: RefreshTokenRecord = {
      ...record,
      createdAt: new Date(),
      revokedAt: null,
      replacedById: null,
    };
    this.records.set(r.tokenHash, r);
    return r;
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.records.get(tokenHash) ?? null;
  }

  async revoke(id: string, replacedById?: string): Promise<void> {
    for (const r of this.records.values()) {
      if (r.id === id) {
        r.revokedAt = new Date();
        if (replacedById) r.replacedById = replacedById;
        return;
      }
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const r of this.records.values()) {
      if (r.familyId === familyId) {
        r.revokedAt = new Date();
      }
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    for (const r of this.records.values()) {
      if (r.sessionId === sessionId) {
        r.revokedAt = new Date();
      }
    }
  }

  size(): number {
    return this.records.size;
  }
}

const SECRETS = {
  access: 'access-secret-at-least-32-chars-xxxxxxxxx',
  refresh: 'refresh-secret-at-least-32-chars-xxxxxx',
};

describe('issueTokenPair', () => {
  it('access + refresh üretir, refresh hash\'lenir', async () => {
    const store = new InMemoryStore();
    const pair = await issueTokenPair(
      {
        userId: '11111111-1111-1111-1111-111111111111',
        role: 'tenant_owner',
        tenantId: '22222222-2222-2222-2222-222222222222',
        identity: 'tenant',
        sessionId: '33333333-3333-3333-3333-333333333333',
      },
      SECRETS,
      {},
      store,
    );

    expect(pair.accessToken.split('.')).toHaveLength(3);
    expect(pair.refreshToken.split('.')).toHaveLength(3);
    expect(pair.refreshTokenHash).not.toBe(pair.refreshToken);
    expect(store.size()).toBe(1);
  });
});

describe('rotateRefreshToken', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('geçerli refresh ile yeni çift üretir ve eski iptal olur', async () => {
    const pair = await issueTokenPair(
      {
        userId: '11111111-1111-1111-1111-111111111111',
        role: 'tenant_owner',
        tenantId: '22222222-2222-2222-2222-222222222222',
        identity: 'tenant',
        sessionId: '33333333-3333-3333-3333-333333333333',
      },
      SECRETS,
      {},
      store,
    );

    // Rotation sırasında yeni refresh üretilir; iat aynı saniyede
    // olsa bile DB'de farklı hash ile kaydedilir (yeni UUID).
    // Burada asıl doğrulama: yeni pair'in hash'i eskisinden farklıdır.
    const result = await rotateRefreshToken(pair.refreshToken, SECRETS, {}, store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pair.familyId).toBe(pair.familyId);
      expect(result.pair.refreshTokenHash).not.toBe(pair.refreshTokenHash);
      // Eski token artık DB'de revoked
      const oldHash = await (await import('../password/index.js')).hashTokenAsync(pair.refreshToken);
      const oldRec = await store.findByHash(oldHash);
      expect(oldRec?.revokedAt).not.toBeNull();
    }
  });

  it('aynı refresh iki kez kullanılırsa reuse detection tetiklenir', async () => {
    const pair = await issueTokenPair(
      {
        userId: '11111111-1111-1111-1111-111111111111',
        role: 'customer',
        tenantId: null,
        identity: 'customer',
        sessionId: '33333333-3333-3333-3333-333333333333',
      },
      SECRETS,
      {},
      store,
    );

    // İlk kullanım başarılı
    const first = await rotateRefreshToken(pair.refreshToken, SECRETS, {}, store);
    expect(first.ok).toBe(true);

    // İlk rotation'dan sonra DB'de 2 kayıt var:
    //  - orijinal (revoked)
    //  - yeni (active)
    // Aynı orijinal token'ı tekrar kullanmak reuse sayılmalı.
    const second = await rotateRefreshToken(pair.refreshToken, SECRETS, {}, store);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('reuse_detected');
    }
  });

  it('geçersiz token reddedilir', async () => {
    const result = await rotateRefreshToken('garbage.token.here', SECRETS, {}, store);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_token');
  });

  it('süresi geçmiş token reddedilir', async () => {
    const pair = await issueTokenPair(
      {
        userId: '11111111-1111-1111-1111-111111111111',
        role: 'customer',
        tenantId: null,
        identity: 'customer',
        sessionId: '33333333-3333-3333-3333-333333333333',
      },
      SECRETS,
      { refreshExpiresInSeconds: 3600 },
      store,
    );

    // DB'de süresini geçmiş yap (test kısayolu)
    const tokenHash = await import('../password/index.js').then((m) => m.hashTokenAsync(pair.refreshToken));
    const rec = await store.findByHash(tokenHash);
    if (rec) rec.expiresAt = new Date(Date.now() - 1000);

    const result = await rotateRefreshToken(pair.refreshToken, SECRETS, {}, store);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });
});