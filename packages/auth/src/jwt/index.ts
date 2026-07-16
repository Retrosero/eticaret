/**
 * JWT imzalama ve doğrulama yardımcıları (jose kullanır).
 *
 * - HS256 simetrik algoritma (paylaşılan secret)
 * - Access token: kısa ömürlü (varsayılan 15dk)
 * - Refresh token: uzun ömürlü (varsayılan 30 gün), DB'de hash'li saklanır
 *
 * @module jwt
 */

import { SignJWT, jwtVerify, type JWTPayload, type JWTVerifyResult } from 'jose';
import type { Uuid } from '@eticart/shared-types';

/** Erişim belirteci gövdesi. */
export interface AccessTokenPayload extends JWTPayload {
  /** Kullanıcı kimliği. */
  sub: Uuid;
  /** Kullanıcı rolü. */
  role: string;
  /** Bağlı tenant (super_admin için null). */
  tenantId: Uuid | null;
  /** Kimlik alanı — super_admin | tenant | customer */
  identity: 'super_admin' | 'tenant' | 'customer';
  /** Oturum kimliği (refresh token ile eşleşir). */
  sessionId: Uuid;
  /** 2FA aktif mi — yarı-doğrulanmış token için kullanılır. */
  twoFactorVerified: boolean;
}

export interface RefreshTokenPayload extends JWTPayload {
  /** Kullanıcı kimliği. */
  sub: Uuid;
  /** Oturum kimliği. */
  sessionId: Uuid;
  /** Token aile kimliği (rotation chain). */
  familyId: Uuid;
  /** Her token'a özgü benzersiz kimlik (jti). */
  jti: string;
  /** Kimlik alanı. */
  identity: 'super_admin' | 'tenant' | 'customer';
}

export interface SignOptions {
  /** Saniye cinsinden geçerlilik süresi. */
  expiresInSeconds: number;
  /** Issuer (varsayılan "eticart"). */
  issuer?: string;
  /** Audience listesi. */
  audience?: string | string[];
  /** Ek private claim'ler. */
  extra?: Record<string, unknown>;
}

export interface VerifyOptions {
  /** Beklenen issuer. */
  issuer?: string;
  /** Beklenen audience listesi. */
  audience?: string | string[];
}

const DEFAULT_ISSUER = 'eticart';

/** Secret'tan jose'un istediği `Uint8Array` formatına dönüştürür. */
function toSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Yeni bir access token üretir.
 *
 * @param payload - claim'ler (sub, role, tenantId, vs.)
 * @param secret - HMAC imzalama anahtarı (env'den okunmalı, hard-code değil)
 * @param opts - süre, issuer, vs.
 */
export async function signAccessToken(
  payload: Omit<AccessTokenPayload, 'iat' | 'exp' | 'iss'>,
  secret: string,
  opts: SignOptions,
): Promise<string> {
  return new SignJWT({ ...payload, ...(opts.extra ?? {}) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(opts.issuer ?? DEFAULT_ISSUER)
    .setAudience(opts.audience ?? DEFAULT_ISSUER)
    .setExpirationTime(`${opts.expiresInSeconds}s`)
    .setSubject(String(payload.sub))
    .sign(toSecretKey(secret));
}

/**
 * Access token'ı doğrular ve payload'ı döner.
 *
 * Hata durumunda `null` döner; çağıran katman 401 yanıtı verir.
 */
export async function verifyAccessToken(
  token: string,
  secret: string,
  opts: VerifyOptions = {},
): Promise<AccessTokenPayload | null> {
  try {
    const result: JWTVerifyResult = await jwtVerify(token, toSecretKey(secret), {
      issuer: opts.issuer ?? DEFAULT_ISSUER,
      audience: opts.audience ?? DEFAULT_ISSUER,
    });
    return result.payload as AccessTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Refresh token üretir (farklı secret kullanılabilir, opsiyonel).
 *
 * familyId özel bir claim olarak payload'a eklenir — token rotation'da
 * aile tespiti için kullanılır. `jti` her token için benzersizdir; aynı
 * saniyede aynı parametrelerle üretilse bile farklı string üretir.
 */
export async function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'iat' | 'exp' | 'iss' | 'jti'>,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  const jti = crypto.randomUUID();
  return new SignJWT({
    sessionId: payload.sessionId,
    familyId: payload.familyId,
    identity: payload.identity,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(DEFAULT_ISSUER)
    .setAudience('refresh')
    .setExpirationTime(`${expiresInSeconds}s`)
    .setSubject(String(payload.sub))
    .setJti(jti)
    .sign(toSecretKey(secret));
}

/**
 * Refresh token doğrular. Audience `refresh` olarak kontrol edilir.
 */
export async function verifyRefreshToken(
  token: string,
  secret: string,
): Promise<RefreshTokenPayload | null> {
  try {
    const result = await jwtVerify(token, toSecretKey(secret), {
      issuer: DEFAULT_ISSUER,
      audience: 'refresh',
    });
    return result.payload as RefreshTokenPayload;
  } catch {
    return null;
  }
}
