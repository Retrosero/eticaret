/**
 * Auth çekirdek servisi — token üretim, refresh, doğrulama,
 * oturum yönetimi. Üç kimlik alanı (super_admin, tenant, customer)
 * için ortak sözleşme sağlar.
 *
 * Veritabanı erişimi `RefreshTokenStore` ve `SessionStore` interface'leri
 * üzerinden soyutlanmıştır. Bu sayede aynı servis hem NestJS
 * controller'ları hem Next.js route handler'ları tarafından kullanılabilir.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Uuid } from '@eticart/shared-types';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import {
  issueTokenPair,
  rotateRefreshToken,
  type JwtSecrets,
  type RefreshTokenStore,
  type RefreshTokenRecord,
  type TokenLifetimeConfig,
  type Identity,
} from '@eticart/auth';

import { LOGGER_TOKEN } from '../../common/logger.js';

export interface PgRefreshTokenStoreOptions {
  /** Audit log'a yazmak için user-type; tablo kontrolü için. */
  userType: 'super_admin' | 'tenant_user' | 'customer';
}

/**
 * Postgre tabanlı RefreshTokenStore implementasyonu.
 * `refresh_tokens` tablosunu doğrudan sorgular.
 */
@Injectable()
export class PgRefreshTokenStore implements RefreshTokenStore {
  constructor(
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
    private readonly userType: PgRefreshTokenStoreOptions['userType'],
  ) {}

  async insert(
    record: Omit<RefreshTokenRecord, 'createdAt' | 'revokedAt' | 'replacedById'>,
  ): Promise<RefreshTokenRecord> {
    const r = await this.pool.query<{
      id: string;
      session_id: string;
      family_id: string;
      user_type: string;
      user_id: string;
      tenant_id: string | null;
      role: string;
      token_hash: string;
      expires_at: Date;
      revoked_at: Date | null;
      replaced_by_id: string | null;
      created_at: Date;
    }>(
      `INSERT INTO public.refresh_tokens
        (session_id, family_id, user_type, user_id, tenant_id, role, token_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        record.sessionId,
        record.familyId,
        this.userType,
        record.userId,
        record.tenantId,
        record.role,
        record.tokenHash,
        record.expiresAt,
      ],
    );
    const row = r.rows[0]!;
    return this.toRecord(row);
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const r = await this.pool.query<{
      id: string;
      session_id: string;
      family_id: string;
      user_type: string;
      user_id: string;
      tenant_id: string | null;
      role: string;
      token_hash: string;
      expires_at: Date;
      revoked_at: Date | null;
      replaced_by_id: string | null;
      created_at: Date;
    }>(
      `SELECT * FROM public.refresh_tokens WHERE token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    const row = r.rows[0];
    return row ? this.toRecord(row) : null;
  }

  async revoke(id: Uuid, replacedById?: Uuid): Promise<void> {
    await this.pool.query(
      `UPDATE public.refresh_tokens
       SET revoked_at = NOW(), replaced_by_id = $2
       WHERE id = $1`,
      [id, replacedById ?? null],
    );
  }

  async revokeFamily(familyId: Uuid): Promise<void> {
    await this.pool.query(
      `UPDATE public.refresh_tokens
       SET revoked_at = NOW()
       WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId],
    );
  }

  async revokeSession(sessionId: Uuid): Promise<void> {
    await this.pool.query(
      `UPDATE public.refresh_tokens
       SET revoked_at = NOW()
       WHERE session_id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  }

  private toRecord(row: {
    id: string;
    session_id: string;
    family_id: string;
    user_type: string;
    user_id: string;
    tenant_id: string | null;
    role: string;
    token_hash: string;
    expires_at: Date;
    revoked_at: Date | null;
    replaced_by_id: string | null;
    created_at: Date;
  }): RefreshTokenRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      familyId: row.family_id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      role: row.role,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      replacedById: row.replaced_by_id,
      createdAt: row.created_at,
    };
  }
}

/** Oturum verisi. */
export interface SessionRecord {
  id: Uuid;
  userId: Uuid;
  userType: Identity;
  tenantId: Uuid | null;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  lastActiveAt: Date;
  revokedAt: Date | null;
}

@Injectable()
export class SessionStore {
  constructor(@Inject('PG_POOL_TOKEN') private readonly pool: Pool) {}

  /** Yeni oturum oluşturur. */
  async create(input: {
    userId: Uuid;
    userType: Identity;
    tenantId: Uuid | null;
    deviceName: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    expiresInSeconds: number;
  }): Promise<SessionRecord> {
    const r = await this.pool.query<{
      id: string;
      user_id: string;
      user_type: string;
      tenant_id: string | null;
      device_name: string | null;
      ip_address: string | null;
      user_agent: string | null;
      last_active_at: Date;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `INSERT INTO public.sessions
        (user_id, user_type, tenant_id, device_name, ip_address, user_agent, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, NOW() + ($7 || ' seconds')::interval)
       RETURNING *`,
      [
        input.userId,
        input.userType,
        input.tenantId,
        input.deviceName,
        input.ipAddress,
        input.userAgent,
        String(input.expiresInSeconds),
      ],
    );
    const row = r.rows[0]!;
    return this.toRecord(row);
  }

  async touch(id: Uuid): Promise<void> {
    await this.pool.query(
      `UPDATE public.sessions SET last_active_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async revoke(id: Uuid, reason: string | null = null): Promise<void> {
    await this.pool.query(
      `UPDATE public.sessions SET revoked_at = NOW(), revoke_reason = $2 WHERE id = $1`,
      [id, reason],
    );
  }

  async revokeAllForUser(
    userId: Uuid,
    userType: Identity,
    reason: string | null = null,
  ): Promise<number> {
    const r = await this.pool.query<{ id: string }>(
      `UPDATE public.sessions
       SET revoked_at = NOW(), revoke_reason = $3
       WHERE user_id = $1 AND user_type = $2 AND revoked_at IS NULL
       RETURNING id`,
      [userId, userType, reason],
    );
    return r.rowCount ?? 0;
  }

  async listForUser(userId: Uuid, userType: Identity): Promise<SessionRecord[]> {
    const r = await this.pool.query<{
      id: string;
      user_id: string;
      user_type: string;
      tenant_id: string | null;
      device_name: string | null;
      ip_address: string | null;
      user_agent: string | null;
      last_active_at: Date;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT * FROM public.sessions
       WHERE user_id = $1 AND user_type = $2 AND revoked_at IS NULL
       ORDER BY last_active_at DESC`,
      [userId, userType],
    );
    return r.rows.map((row) => this.toRecord(row));
  }

  async findById(id: Uuid): Promise<SessionRecord | null> {
    const r = await this.pool.query<{
      id: string;
      user_id: string;
      user_type: string;
      tenant_id: string | null;
      device_name: string | null;
      ip_address: string | null;
      user_agent: string | null;
      last_active_at: Date;
      expires_at: Date;
      revoked_at: Date | null;
    }>(`SELECT * FROM public.sessions WHERE id = $1 LIMIT 1`, [id]);
    const row = r.rows[0];
    return row ? this.toRecord(row) : null;
  }

  private toRecord(row: {
    id: string;
    user_id: string;
    user_type: string;
    tenant_id: string | null;
    device_name: string | null;
    ip_address: string | null;
    user_agent: string | null;
    last_active_at: Date;
    expires_at: Date;
    revoked_at: Date | null;
  }): SessionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      userType: row.user_type as Identity,
      tenantId: row.tenant_id,
      deviceName: row.device_name,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      expiresAt: row.expires_at,
      lastActiveAt: row.last_active_at,
      revokedAt: row.revoked_at,
    };
  }
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface TokenIssueContext {
  userId: Uuid;
  email: string;
  role: string;
  tenantId: Uuid | null;
  identity: Identity;
  twoFactorVerified: boolean;
  /** Mevcut oturum ID'si (refresh'te) veya yeni oturum (login'de). */
  sessionId: Uuid;
  /** Refresh token store — kimlik alanına göre seçilir. */
  store: RefreshTokenStore;
  /** Client metadata (device, ip, ua). */
  device?: { deviceName: string | null; ip: string | null; userAgent: string | null };
}

/**
 * Auth çekirdek servisi.
 *
 * Hem super_admin hem tenant hem customer kimlik alanları için token
 * üretimi, refresh rotation ve logout işlemlerini yapar.
 */
@Injectable()
export class AuthCoreService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('APP_ENV') private readonly env: {
      JWT_SECRET: string;
      JWT_REFRESH_SECRET?: string;
      JWT_ACCESS_EXPIRES_IN?: number;
      JWT_REFRESH_EXPIRES_IN?: number;
      NODE_ENV?: string;
    },
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
  ) {}

  private get secrets(): JwtSecrets {
    const access = this.env.JWT_SECRET;
    // Refresh için ayrı secret yoksa access secret kullanılır;
    // prod ortamında ayrı secret zorunlu olmalı.
    const refresh = this.env.JWT_REFRESH_SECRET ?? access;
    if (!access || access.length < 32) {
      throw new ApiError(
        500,
        ErrorCode.INTERNAL_SERVER_ERROR,
        'JWT_SECRET en az 32 karakter olmalıdır.',
      );
    }
    return { access, refresh };
  }

  private get lifetimes(): TokenLifetimeConfig {
    return {
      accessExpiresInSeconds: this.env.JWT_ACCESS_EXPIRES_IN ?? 15 * 60,
      refreshExpiresInSeconds: this.env.JWT_REFRESH_EXPIRES_IN ?? 30 * 24 * 60 * 60,
    };
  }

  /**
   * Yeni access + refresh token çifti üretir. Login sırasında çağrılır.
   */
  async issueTokens(ctx: TokenIssueContext): Promise<IssuedTokens> {
    const pair = await issueTokenPair(
      {
        userId: ctx.userId,
        role: ctx.role,
        tenantId: ctx.tenantId,
        identity: ctx.identity,
        sessionId: ctx.sessionId,
        twoFactorVerified: ctx.twoFactorVerified,
      },
      this.secrets,
      this.lifetimes,
      ctx.store,
    );

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: this.lifetimes.accessExpiresInSeconds,
      tokenType: 'Bearer',
    };
  }

  /**
   * Refresh token rotation. Eski refresh iptal edilir, yeni çift üretilir.
   */
  async rotateTokens(
    refreshToken: string,
    store: RefreshTokenStore,
  ): Promise<IssuedTokens> {
    const result = await rotateRefreshToken(refreshToken, this.secrets, this.lifetimes, store);
    if (!result.ok) {
      switch (result.reason) {
        case 'expired':
          throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Yenileme belirteci süresi dolmuş.');
        case 'reuse_detected':
          // Tüm aile iptal edildi; security alert loglanmalı
          this.logger.warn(
            { reason: 'reuse_detected' },
            'Refresh token reuse tespit edildi; aile iptal edildi',
          );
          throw new ApiError(
            401,
            ErrorCode.UNAUTHORIZED,
            'Yenileme belirteci geçersiz; güvenlik nedeniyle tüm oturumlarınız kapatıldı.',
          );
        default:
          throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Yenileme belirteci geçersiz.');
      }
    }
    return {
      accessToken: result.pair.accessToken,
      refreshToken: result.pair.refreshToken,
      expiresIn: this.lifetimes.accessExpiresInSeconds,
      tokenType: 'Bearer',
    };
  }

  /** Login attempt logu. */
  async recordLoginAttempt(input: {
    email: string;
    userType: Identity | null;
    userId: Uuid | null;
    success: boolean;
    failureReason: string | null;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO public.login_attempts
          (user_type, email_attempted, ip_address, user_agent, success, failure_reason, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          input.userType,
          input.email,
          input.ip,
          input.userAgent,
          input.success,
          input.failureReason,
          input.userId,
        ],
      );
    } catch (err) {
      this.logger.warn({ err }, 'Login attempt logu yazılamadı');
    }
  }
}