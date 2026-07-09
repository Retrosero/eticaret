/**
 * Refresh token rotation mantığı.
 *
 * - Her refresh'te yeni access + refresh üretilir.
 * - Eski refresh token iptal edilir (DB'de `revoked_at` set edilir).
 * - Eğer iptal edilmiş bir refresh token tekrar kullanılırsa
 *   "token reuse detected" → tüm oturum ailesi iptal edilir.
 *
 * Bu modül DB'den bağımsız bir sözleşme sunar. Her uygulama kendi
 * repository'si üzerinden `RefreshTokenStore` interface'ini uygular.
 *
 * @module tokens
 */

import type { Uuid } from '@eticart/shared-types';
import { errors as joseErrors } from 'jose';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from '../jwt/index.js';
import { hashTokenAsync } from '../password/index.js';

export type Identity = 'super_admin' | 'tenant' | 'customer';

/** Bir refresh token'ın DB kaydı (uygulama tarafından uygulanır). */
export interface RefreshTokenRecord {
  id: Uuid;
  sessionId: Uuid;
  familyId: Uuid;
  userId: Uuid;
  /** Kullanıcının rolü — access token üretirken gerekir. */
  role: string;
  tenantId: Uuid | null;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: Uuid | null;
  createdAt: Date;
}

/**
 * Refresh token store interface'i — DB erişimi için adapter sözleşmesi.
 * Her uygulama (control-plane, tenant-admin, storefront) kendi
 * repository'sini yazar.
 */
export interface RefreshTokenStore {
  /** Token'ı hash'lenmiş haliyle DB'ye yazar. */
  insert(record: Omit<RefreshTokenRecord, 'createdAt' | 'revokedAt' | 'replacedById'>): Promise<RefreshTokenRecord>;
  /** Hash'ten kaydı bulur. */
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Token'ı iptal eder. */
  revoke(id: Uuid, replacedById?: Uuid): Promise<void>;
  /** Tüm aileyi iptal eder (token reuse detection). */
  revokeFamily(familyId: Uuid): Promise<void>;
  /** Tüm oturumu iptal eder (logout). */
  revokeSession(sessionId: Uuid): Promise<void>;
}

export interface IssueTokenInput {
  userId: Uuid;
  role: string;
  tenantId: Uuid | null;
  identity: Identity;
  sessionId: Uuid;
  familyId?: Uuid;
  twoFactorVerified?: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  familyId: Uuid;
  sessionId: Uuid;
}

export interface JwtSecrets {
  /** Access token imzalama. */
  access: string;
  /** Refresh token imzalama. */
  refresh: string;
}

export interface TokenLifetimeConfig {
  /** Saniye cinsinden access token ömrü. Varsayılan 15 dakika. */
  accessExpiresInSeconds: number;
  /** Saniye cinsinden refresh token ömrü. Varsayılan 30 gün. */
  refreshExpiresInSeconds: number;
  /** Issuer adı. */
  issuer?: string;
}

const DEFAULT_LIFETIME: TokenLifetimeConfig = {
  accessExpiresInSeconds: 15 * 60,
  refreshExpiresInSeconds: 30 * 24 * 60 * 60,
};

/**
 * Yeni bir access + refresh token çifti üretir.
 *
 * Refresh token DB'ye hash'li yazılır; plain metin yalnızca çağırana döner.
 */
export async function issueTokenPair(
  input: IssueTokenInput,
  secrets: JwtSecrets,
  config: Partial<TokenLifetimeConfig> = {},
  store: RefreshTokenStore,
): Promise<TokenPair> {
  const cfg = { ...DEFAULT_LIFETIME, ...config };
  const familyId = input.familyId ?? (crypto.randomUUID() as Uuid);

  const accessPayload: Omit<AccessTokenPayload, 'iat' | 'exp' | 'iss'> = {
    sub: input.userId,
    role: input.role,
    tenantId: input.tenantId,
    identity: input.identity,
    sessionId: input.sessionId,
    twoFactorVerified: input.twoFactorVerified ?? false,
  };

  const refreshPayload: Omit<RefreshTokenPayload, 'iat' | 'exp' | 'iss'> = {
    sub: input.userId,
    sessionId: input.sessionId,
    familyId,
    identity: input.identity,
  };

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(accessPayload, secrets.access, {
      expiresInSeconds: cfg.accessExpiresInSeconds,
      issuer: cfg.issuer,
    }),
    signRefreshToken(refreshPayload, secrets.refresh, cfg.refreshExpiresInSeconds),
  ]);

  const refreshTokenHash = await hashTokenAsync(refreshToken);

  await store.insert({
    id: crypto.randomUUID() as Uuid,
    sessionId: input.sessionId,
    familyId,
    userId: input.userId,
    role: input.role,
    tenantId: input.tenantId,
    tokenHash: refreshTokenHash,
    expiresAt: new Date(Date.now() + cfg.refreshExpiresInSeconds * 1000),
  });

  return {
    accessToken,
    refreshToken,
    refreshTokenHash,
    familyId,
    sessionId: input.sessionId,
  };
}

export interface RotateResult {
  ok: true;
  pair: TokenPair;
  payload: RefreshTokenPayload;
}

export interface RotateError {
  ok: false;
  reason: 'invalid_token' | 'expired' | 'reuse_detected';
}

/**
 * Refresh token rotation — eski refresh iptal, yeni çift üret.
 *
 * Token reuse detection: Eğer DB'de kayıt `revokedAt` set edilmiş
 * ama kullanıcı aynı token'ı tekrar gönderiyorsa bu saldırı belirtisidir;
 * tüm aile iptal edilir.
 */
export async function rotateRefreshToken(
  refreshToken: string,
  secrets: JwtSecrets,
  config: Partial<TokenLifetimeConfig> = {},
  store: RefreshTokenStore,
): Promise<RotateResult | RotateError> {
  const payload = await verifyRefreshToken(refreshToken, secrets.refresh);
  if (!payload) {
    return { ok: false, reason: 'invalid_token' };
  }

  const tokenHash = await hashTokenAsync(refreshToken);
  const record = await store.findByHash(tokenHash);

  if (!record) {
    return { ok: false, reason: 'invalid_token' };
  }

  if (record.expiresAt.getTime() < Date.now()) {
    await store.revoke(record.id);
    return { ok: false, reason: 'expired' };
  }

  if (record.revokedAt !== null) {
    // Token reuse detection — tüm aileyi iptal et
    await store.revokeFamily(record.familyId);
    return { ok: false, reason: 'reuse_detected' };
  }

  // Yeni token çifti üret (aynı aile içinde)
  const newPair = await issueTokenPair(
    {
      userId: payload.sub,
      role: record.role,
      tenantId: record.tenantId,
      identity: payload.identity,
      sessionId: payload.sessionId,
      familyId: record.familyId,
    },
    secrets,
    config,
    store,
  );

  // Eski token'ı iptal et, yeni ile ilişkilendir
  await store.revoke(record.id, newPair.refreshTokenHash ? undefined : undefined);

  return { ok: true, pair: newPair, payload };
}

/**
 * Access token doğrulama — kontrol katmanı (NestJS Guard) için.
 */
export async function validateAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenPayload | null> {
  return verifyAccessToken(token, secret);
}