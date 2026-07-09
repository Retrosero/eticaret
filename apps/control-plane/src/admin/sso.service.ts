/**
 * SSO Service — Google + Microsoft OAuth2.
 *
 * Akış:
 *   1. Client /api/v1/sso/google/login → Google OAuth URL
 *   2. Kullanıcı Google'da login → callback /api/v1/sso/google/callback?code=...
 *   3. Token al, user info al
 *   4. Super admin user oluştur / güncelle
 *   5. Session token ver
 *
 * Microsoft için aynı akış, farklı provider URL'leri.
 *
 * NOT: Production'da client_secret'lar env'den okunmalı.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';

import { LOGGER_TOKEN } from '../common/logger.js';
import type {
  SuperAdminUser,
  SuperAdminRole,
  SuperAdminSession,
} from './rbac.types.js';
import { getPermissions } from './rbac.types.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_USERINFO_URL = 'https://graph.microsoft.com/oidc/userinfo';

const SESSION_TTL_HOURS = 8;

@Injectable()
export class SsoService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // OAUTH FLOW
  // ─────────────────────────────────────────────────────────────

  /**
   * Google OAuth2 login URL.
   */
  getGoogleLoginUrl(state: string, redirectUri: string): string {
    const clientId = process.env['GOOGLE_CLIENT_ID'] ?? '';
    if (!clientId) {
      throw new ApiError(
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
        'Google OAuth yapılandırılmamış.',
      );
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Microsoft OAuth2 login URL.
   */
  getMicrosoftLoginUrl(state: string, redirectUri: string): string {
    const clientId = process.env['MS_CLIENT_ID'] ?? '';
    if (!clientId) {
      throw new ApiError(
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
        'Microsoft OAuth yapılandırılmamış.',
      );
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return `${MS_AUTH_URL}?${params.toString()}`;
  }

  /**
   * OAuth callback — code'u token + user info'ya çevir.
   */
  async handleCallback(
    provider: 'google' | 'microsoft',
    code: string,
    redirectUri: string,
  ): Promise<{
    user: SuperAdminUser;
    session: SuperAdminSession;
  }> {
    const tokenUrl = provider === 'google' ? GOOGLE_TOKEN_URL : MS_TOKEN_URL;
    const userInfoUrl = provider === 'google' ? GOOGLE_USERINFO_URL : MS_USERINFO_URL;
    const clientId = provider === 'google'
      ? process.env['GOOGLE_CLIENT_ID']
      : process.env['MS_CLIENT_ID'];
    const clientSecret = provider === 'google'
      ? process.env['GOOGLE_CLIENT_SECRET']
      : process.env['MS_CLIENT_SECRET'];

    if (!clientId || !clientSecret) {
      throw new ApiError(
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
        `${provider} OAuth yapılandırılmamış.`,
      );
    }

    // 1. Code → token
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        `${provider} token exchange başarısız.`,
      );
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'Access token alınamadı.',
      );
    }

    // 2. Access token → user info
    const userInfoRes = await fetch(userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userInfoRes.ok) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'User info alınamadı.',
      );
    }
    const userInfo = (await userInfoRes.json()) as {
      sub: string;
      email: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    // 3. Allowlist check (sadece izinli admin email'ler)
    const allowlist = (process.env['SUPER_ADMIN_ALLOWLIST'] ?? '').split(',').map((e) => e.trim().toLowerCase());
    if (allowlist.length > 0 && !allowlist.includes(userInfo.email.toLowerCase())) {
      throw new ApiError(
        403,
        ErrorCode.FORBIDDEN,
        'Bu email için super admin erişimi yok.',
      );
    }

    // 4. User oluştur / güncelle
    const user = await this.upsertUser(provider, userInfo);

    // 5. Session oluştur
    const session = await this.createSession(user);

    this.logger.info(
      { userId: user.id, email: user.email, provider },
      'Super admin SSO login',
    );

    return { user, session };
  }

  // ─────────────────────────────────────────────────────────────
  // USER & SESSION MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  private async upsertUser(
    provider: 'google' | 'microsoft',
    info: {
      sub: string;
      email: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      email_verified?: boolean;
    },
  ): Promise<SuperAdminUser> {
    const fullName = info.name ?? `${info.given_name ?? ''} ${info.family_name ?? ''}`.trim() ?? info.email;

    // İlk kez giriyorsa default role: viewer (super_owner atamalı)
    // Mevcutsa güncelle (last_login, picture)
    const r = await this.pool.query<{
      id: string;
      email: string;
      full_name: string;
      role: string;
      two_factor_enabled: boolean;
      sso_provider: string;
      sso_subject: string | null;
      is_active: boolean;
      last_login_at: Date | null;
      created_at: Date;
      metadata: Record<string, unknown>;
    }>(
      `INSERT INTO public.super_admin_users (
         email, full_name, role, sso_provider, sso_subject,
         picture, email_verified, is_active, last_login_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())
       ON CONFLICT (email) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             picture = EXCLUDED.picture,
             last_login_at = now()
       RETURNING *`,
      [
        info.email.toLowerCase(),
        fullName,
        'viewer' as SuperAdminRole, // Default role
        provider,
        info.sub,
        info.picture,
        info.email_verified ?? false,
      ],
    );
    const row = r.rows[0]!;
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role as SuperAdminRole,
      twoFactorEnabled: row.two_factor_enabled,
      ssoProvider: row.sso_provider as 'google' | 'microsoft',
      ssoSubject: row.sso_subject,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      metadata: row.metadata,
    };
  }

  private async createSession(user: SuperAdminUser): Promise<SuperAdminSession> {
    const sessionId = randomBytes(32).toString('hex');
    const token = randomBytes(48).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO public.super_admin_sessions (
         id, user_id, token_hash, ip, user_agent, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        sessionId,
        user.id,
        tokenHash,
        '', // IP ve user-agent middleware'de set edilebilir
        '',
        expiresAt,
      ],
    );

    return {
      id: sessionId,
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: getPermissions(user.role),
      twoFactorVerified: !user.twoFactorEnabled, // 2FA yoksa otomatik verify
      ip: '',
      userAgent: '',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
      revokedReason: null,
    };
  }

  /**
   * Token'dan session çözümle.
   */
  async resolveSession(token: string): Promise<SuperAdminSession | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const r = await this.pool.query(
      `SELECT s.*, u.role, u.is_active
       FROM public.super_admin_sessions s
       INNER JOIN public.super_admin_users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
       LIMIT 1`,
      [tokenHash],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: row['id'],
      userId: row['user_id'],
      email: row['email'],
      role: row['role'] as SuperAdminRole,
      permissions: getPermissions(row['role']),
      twoFactorVerified: row['two_factor_verified'] ?? true,
      ip: row['ip'] ?? '',
      userAgent: row['user_agent'] ?? '',
      createdAt: row['created_at'].toISOString(),
      expiresAt: row['expires_at'].toISOString(),
      revokedAt: row['revoked_at']?.toISOString() ?? null,
      revokedReason: row['revoked_reason'] ?? null,
    };
  }

  /**
   * Session revoke (logout veya admin tarafından).
   */
  async revokeSession(
    sessionId: string,
    reason: string,
  ): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE public.super_admin_sessions
       SET revoked_at = now(), revoked_reason = $2
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, reason],
    );
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * User'ın tüm aktif session'larını listele.
   */
  async listUserSessions(userId: string): Promise<SuperAdminSession[]> {
    const r = await this.pool.query(
      `SELECT * FROM public.super_admin_sessions
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > now()
       ORDER BY created_at DESC`,
      [userId],
    );
    return r.rows.map((row) => ({
      id: row['id'],
      userId: row['user_id'],
      email: '',
      role: 'viewer' as SuperAdminRole,
      permissions: [],
      twoFactorVerified: true,
      ip: row['ip'] ?? '',
      userAgent: row['user_agent'] ?? '',
      createdAt: row['created_at'].toISOString(),
      expiresAt: row['expires_at'].toISOString(),
      revokedAt: null,
      revokedReason: null,
    }));
  }
}
