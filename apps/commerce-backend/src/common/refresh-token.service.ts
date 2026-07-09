/**
 * Refresh token rotation + revocation list servisi.
 *
 * Akış (rotation):
 *   1. Client eski refresh token ile POST /auth/refresh yapar
 *   2. Server eski token'ı doğrular + revocation list'te yoksa:
 *      a) Eski JTI'yi revocation list'e ekle (rotated)
 *      b) Yeni access + refresh token üret (aynı familyId, yeni JTI)
 *      c) İkisi de döner
 *
 * Güvenlik (replay detection):
 *   - Eğer revoke edilmiş JTI tekrar kullanılırsa:
 *     a) Token reject
 *     b) Aynı familyId'deki TÜM token'lar revoke edilir (logout everywhere)
 *     c) Audit log: critical severity "token.reuse_detected"
 *
 * @eticart/auth'in signRefreshToken/verifyRefreshToken'ını kullanır.
 */
import { createLogger } from '@eticart/config';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@eticart/auth';
import { Audit } from './audit.service.js';

const log = createLogger({ service: 'refresh-token-service' });

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  familyId: string;
  expiresIn: number;
}

export interface IdentityInfo {
  userId: string;
  email: string;
  tenantId?: string;
  roles?: string[];
  customerId?: string;
}

export interface RotateOptions {
  /** Refresh token TTL (saniye). */
  refreshTtlSeconds?: number;
  /** Access token TTL (saniye). */
  accessTtlSeconds?: number;
}

export class RefreshTokenService {
  /**
   * Refresh token rotation.
   *
   * @param oldRefreshToken — Client'tan gelen refresh token
   * @param dbWriter — JTI'leri revoke etmek için DB writer
   * @returns Yeni access + refresh token
   * @throws Error — token geçersiz/revoke edilmiş/expire olmuş
   */
  async rotate(
    oldRefreshToken: string,
    secrets: { access: string; refresh: string },
    dbWriter: {
      /** JTI revoke listesinde mi kontrol et */
      isRevoked: (jti: string) => Promise<boolean>;
      /** JTI'yi revoke listesine ekle */
      revoke: (params: {
        jti: string;
        familyId: string;
        tenantId?: string;
        userId?: string;
        reason: 'rotated' | 'reused' | 'logout' | 'manual';
        expiresAt: Date;
      }) => Promise<void>;
      /** Aynı familyId'deki tüm JTI'leri revoke et (cascade logout) */
      revokeFamily: (familyId: string) => Promise<void>;
      /** Access token payload'a dönüştürmek için identity lookup */
      resolveIdentity: (
        userId: string,
      ) => Promise<IdentityInfo | null>;
    },
    options: RotateOptions = {},
  ): Promise<RefreshResult> {
    const refreshTtl = options.refreshTtlSeconds ?? 60 * 60 * 24 * 30; // 30 gün
    const accessTtl = options.accessTtlSeconds ?? 3600; // 1 saat

    // 1) Verify refresh token
    const payload = await verifyRefreshToken(oldRefreshToken, secrets.refresh);
    if (!payload) {
      throw new Error('Geçersiz veya süresi dolmuş refresh token.');
    }

    // 2) Replay kontrolü — JTI revoke listesinde mi?
    if (payload.jti && (await dbWriter.isRevoked(payload.jti))) {
      // REPLAY DETECTED — aynı family'deki tüm token'ları iptal et
      log.error(
        { jti: payload.jti, familyId: payload.familyId },
        'Refresh token REUSE detected — revoking entire family',
      );

      await dbWriter.revokeFamily(payload.familyId);

      // Critical audit log
      Audit.record({
        action: 'token.reuse_detected',
        severity: 'critical',
        context: {
          jti: payload.jti,
          familyId: payload.familyId,
          reason: 'replay detected, cascading revoke',
        },
      });

      throw new Error('Refresh token reuse detected. Tüm oturumlar iptal edildi.');
    }

    // 3) Identity çözümle (userId → user bilgisi)
    const identity = await dbWriter.resolveIdentity(payload.sub);
    if (!identity || !identity.email) {
      throw new Error('Refresh token identity çözümlenemedi.');
    }

    // 4) Eski JTI'yi revoke listesine ekle
    if (payload.jti) {
      await dbWriter.revoke({
        jti: payload.jti,
        familyId: payload.familyId,
        tenantId: identity.tenantId,
        userId: identity.userId,
        reason: 'rotated',
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      });
    }

    const newAccessToken = await signAccessToken(
      {
        sub: identity.userId,
        email: identity.email,
        tenantId: identity.tenantId,
        roles: identity.roles,
        customerId: identity.customerId,
      },
      secrets.access,
      {
        expiresInSeconds: accessTtl,
        issuer: 'eticart',
      },
    );

    // signRefreshToken.identity literal string bekliyor (super_admin/tenant/customer)
    // Mevcut auth paketi: payload.identity string union. Biz tenant döngüsü için 'tenant' kullanıyoruz.
    const newRefreshToken = await signRefreshToken(
      {
        sessionId: payload.sessionId,
        familyId: payload.familyId,
        identity: (identity.roles?.includes('tenant_admin') ? 'tenant' : 'customer') as any,
      },
      secrets.refresh,
      refreshTtl,
    );

    log.info(
      { familyId: payload.familyId, userId: identity.userId },
      'Refresh token rotated',
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      familyId: payload.familyId,
      expiresIn: accessTtl,
    };
  }

  /**
   * Logout — tek bir refresh token'ı revoke et.
   */
  async logout(
    refreshToken: string,
    secrets: { refresh: string },
    dbWriter: {
      revoke: (params: {
        jti: string;
        familyId: string;
        tenantId?: string;
        userId?: string;
        reason: 'rotated' | 'reused' | 'logout' | 'manual';
        expiresAt: Date;
      }) => Promise<void>;
    },
  ): Promise<void> {
    const payload = await verifyRefreshToken(refreshToken, secrets.refresh);
    if (!payload || !payload.jti) return;

    // Logout'ta identity çözümleme caller'a bırakıldı (basitlik için)
    await dbWriter.revoke({
      jti: payload.jti,
      familyId: payload.familyId,
      reason: 'logout',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    Audit.record({
      action: 'logout',
      severity: 'info',
      context: { jti: payload.jti, familyId: payload.familyId },
    });
  }
}

/** Singleton refresh token servisi. */
export const refreshTokenService = new RefreshTokenService();
export default refreshTokenService;