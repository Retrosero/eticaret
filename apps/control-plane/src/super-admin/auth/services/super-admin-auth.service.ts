/**
 * Super admin auth iş mantığı.
 *
 * - Login: email + şifre doğrulama, brute-force kontrolü, oturum açma
 * - Refresh: token rotation
 * - Logout: refresh + session iptal
 * - Forgot/Reset password: tek-kullanımlık token
 * - 2FA: TOTP secret üretimi, doğrulama, backup kodları
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Uuid } from '@eticart/shared-types';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashTokenAsync,
  generateTotpSecret,
  verifyTotpCode,
  generateBackupCodes,
  consumeBackupCode,
  type RefreshTokenStore,
} from '@eticart/auth';

import { LOGGER_TOKEN } from '../../../common/logger.js';
import {
  AuthCoreService,
  SessionStore,
} from '../../../auth/services/auth-core.service.js';
import { BruteForceService } from '../../../auth/services/brute-force.service.js';
import { maskMail } from '../../../shared/masking.js';

export interface SuperAdminLoginContext {
  email: string;
  password: string;
  twoFactorCode?: string;
  ip: string | null;
  userAgent: string | null;
  deviceName: string | null;
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: {
    id: string;
    email: string;
    fullName: string;
    role: 'super_admin';
  };
  twoFactorRequired?: boolean;
}

interface SuperAdminUserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  status: string;
  two_factor_enabled: boolean;
  email_verified: boolean;
  failed_login_count: number;
  locked_until: Date | null;
}

@Injectable()
export class SuperAdminAuthService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
    @Inject('SUPER_ADMIN_REFRESH_STORE') private readonly refreshStore: RefreshTokenStore,
    private readonly authCore: AuthCoreService,
    private readonly sessions: SessionStore,
    private readonly bruteForce: BruteForceService,
  ) {}

  /**
   * Login — email + şifre (gerekirse 2FA kodu).
   */
  async login(ctx: SuperAdminLoginContext): Promise<AuthTokensResponse> {
    const emailLower = ctx.email.toLowerCase();

    // Brute-force kontrolü
    if (ctx.ip && (await this.bruteForce.isLocked({ email: emailLower, ip: ctx.ip }))) {
      await this.authCore.recordLoginAttempt({
        email: emailLower,
        userType: 'super_admin',
        userId: null,
        success: false,
        failureReason: 'locked',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new ApiError(
        429,
        ErrorCode.RATE_LIMITED,
        'Çok fazla başarısız deneme. Lütfen bir süre sonra tekrar deneyin.',
      );
    }

    const r = await this.pool.query<SuperAdminUserRow>(
      `SELECT id, email, full_name, password_hash, status, two_factor_enabled,
              email_verified, failed_login_count, locked_until
       FROM public.super_admin_users WHERE email = $1 LIMIT 1`,
      [emailLower],
    );
    const user = r.rows[0];

    // Kullanıcı yoksa veya şifre yanlışsa aynı yanıt süresini ver (timing attack koruması)
    const validPassword = user
      ? await verifyPassword(user.password_hash, ctx.password)
      : await verifyPassword(
          '$argon2id$v=19$m=65536,t=3,p=4$YWFhYWFhYWFhYWFhYWFhYQ$YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE',
          ctx.password,
        );

    if (!user || !validPassword) {
      if (ctx.ip) {
        await this.bruteForce.recordFailedAttempt({ email: emailLower, ip: ctx.ip });
      }
      await this.authCore.recordLoginAttempt({
        email: emailLower,
        userType: 'super_admin',
        userId: user?.id ?? null,
        success: false,
        failureReason: 'invalid_credentials',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Geçersiz e-posta veya şifre.');
    }

    if (user.status !== 'active') {
      throw new ApiError(403, ErrorCode.FORBIDDEN, 'Hesap aktif değil.');
    }

    if (user.locked_until && user.locked_until > new Date()) {
      throw new ApiError(423, ErrorCode.FORBIDDEN, 'Hesap geçici olarak kilitli.');
    }

    // 2FA kontrolü
    let twoFactorVerified = true;
    if (user.two_factor_enabled) {
      twoFactorVerified = false;
      if (!ctx.twoFactorCode) {
        throw new ApiError(
          401,
          ErrorCode.UNAUTHORIZED,
          'İki aşamalı doğrulama kodu gerekli.',
        );
      }
      const verified = await this.verifyTwoFactorCode(user.id, ctx.twoFactorCode);
      if (!verified) {
        throw new ApiError(
          401,
          ErrorCode.UNAUTHORIZED,
          'İki aşamalı doğrulama kodu geçersiz.',
        );
      }
      twoFactorVerified = true;
    }

    // Oturum oluştur
    const session = await this.sessions.create({
      userId: user.id,
      userType: 'super_admin',
      tenantId: null,
      deviceName: ctx.deviceName,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      expiresInSeconds: 30 * 24 * 60 * 60,
    });

    // Token üret
    const tokens = await this.authCore.issueTokens({
      userId: user.id,
      email: user.email,
      role: 'super_admin',
      tenantId: null,
      identity: 'super_admin',
      sessionId: session.id,
      twoFactorVerified,
      store: this.refreshStore,
    });

    // Başarı sayacını sıfırla
    await this.bruteForce.resetEmailCounter(emailLower);
    await this.pool.query(
      `UPDATE public.super_admin_users
       SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW()
       WHERE id = $1`,
      [user.id],
    );
    await this.authCore.recordLoginAttempt({
      email: emailLower,
      userType: 'super_admin',
      userId: user.id,
      success: true,
      failureReason: null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    this.logger.info(
      { superAdminId: user.id, email: maskMail(user.email), sessionId: session.id },
      'Süper admin girişi başarılı',
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: 'super_admin',
      },
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const tokens = await this.authCore.rotateTokens(refreshToken, this.refreshStore);

    // Hangi kullanıcıya ait olduğunu bul
    const tokenHash = await hashTokenAsync(refreshToken);
    const oldRec = await this.pool.query<{
      user_id: string;
      session_id: string;
    }>(
      `SELECT user_id, session_id FROM public.refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = oldRec.rows[0];
    if (!row) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Geçersiz yenileme belirteci.');
    }

    const r = await this.pool.query<{
      id: string;
      email: string;
      full_name: string;
    }>(
      `SELECT id, email, full_name FROM public.super_admin_users WHERE id = $1`,
      [row.user_id],
    );
    const user = r.rows[0];
    if (!user) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Kullanıcı bulunamadı.');
    }

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: 'super_admin',
      },
    };
  }

  async logout(sessionId: Uuid): Promise<{ ok: true }> {
    await this.refreshStore.revokeSession(sessionId);
    await this.sessions.revoke(sessionId, 'user_logout');
    return { ok: true };
  }

  async logoutAll(userId: Uuid): Promise<{ revokedSessions: number }> {
    const count = await this.sessions.revokeAllForUser(userId, 'super_admin', 'logout_all');
    return { revokedSessions: count };
  }

  /** Şifre sıfırlama isteği — token üretir ve DB'ye yazar. */
  async requestPasswordReset(email: string): Promise<{ ok: true }> {
    const r = await this.pool.query<{ id: string }>(
      `SELECT id FROM public.super_admin_users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
    );
    const user = r.rows[0];
    // Kullanıcı yoksa da aynı yanıt (bilgi sızdırmamak için)
    if (!user) {
      this.logger.info({ email: maskMail(email) }, 'Şifre sıfırlama istendi (kullanıcı yok)');
      return { ok: true };
    }

    const token = generateSecureToken(32);
    const tokenHash = await hashTokenAsync(token);
    const ttlSeconds = 60 * 60; // 1 saat
    await this.pool.query(
      `INSERT INTO public.password_reset_tokens
        (user_type, user_id, token_hash, expires_at)
       VALUES ('super_admin', $1, $2, NOW() + ($3 || ' seconds')::interval)`,
      [user.id, tokenHash, String(ttlSeconds)],
    );

    // Gerçek uygulamada e-posta gönderimi adapter üzerinden yapılır
    this.logger.info(
      { userId: user.id, email: maskMail(email) },
      'Şifre sıfırlama token üretildi (Faz 9 e-posta entegrasyonunda gönderilecek)',
    );

    return { ok: true };
  }

  /** Şifre sıfırlama token'ı ile yeni şifre belirle. */
  async resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
    const tokenHash = await hashTokenAsync(token);
    const r = await this.pool.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      used_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
       FROM public.password_reset_tokens
       WHERE token_hash = $1 AND user_type = 'super_admin' LIMIT 1`,
      [tokenHash],
    );
    const rec = r.rows[0];
    if (!rec || rec.used_at || rec.expires_at < new Date()) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'Sıfırlama belirteci geçersiz veya süresi dolmuş.',
      );
    }
    const newHash = await hashPassword(newPassword);
    await this.pool.query(
      `UPDATE public.super_admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, rec.user_id],
    );
    await this.pool.query(
      `UPDATE public.password_reset_tokens SET used_at = NOW() WHERE id = $1`,
      [rec.id],
    );
    // Tüm aktif oturumları kapat
    await this.sessions.revokeAllForUser(rec.user_id, 'super_admin', 'password_reset');
    return { ok: true };
  }

  /** 2FA kurulumu başlat. */
  async startTwoFactorSetup(
    userId: Uuid,
    email: string,
  ): Promise<{ secret: string; qrCodeDataUrl: string; manualEntryKey: string }> {
    const totp = await generateTotpSecret(email, 'EtiCart Super Admin');
    // DB'de sakla (henüz enabled değil; verify olunca enabled_at set edilir)
    await this.pool.query(
      `INSERT INTO public.two_factor_secrets (user_type, user_id, secret_encrypted)
       VALUES ('super_admin', $1, $2)
       ON CONFLICT (user_type, user_id)
       DO UPDATE SET secret_encrypted = EXCLUDED.secret_encrypted,
                     enabled_at = NULL, backup_codes_hash = '{}'`,
      [userId, totp.secret],
    );
    return {
      secret: totp.secret,
      qrCodeDataUrl: totp.qrCodeDataUrl,
      manualEntryKey: totp.manualEntryKey,
    };
  }

  /** 2FA doğrula ve aktif et; backup kodları üret. */
  async enableTwoFactor(
    userId: Uuid,
    code: string,
  ): Promise<{ backupCodes: ReadonlyArray<string> }> {
    const r = await this.pool.query<{ secret_encrypted: string }>(
      `SELECT secret_encrypted FROM public.two_factor_secrets
       WHERE user_type = 'super_admin' AND user_id = $1 LIMIT 1`,
      [userId],
    );
    const row = r.rows[0];
    if (!row) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, '2FA kurulumu başlatılmamış.');
    }
    if (!verifyTotpCode(code, row.secret_encrypted)) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Doğrulama kodu geçersiz.');
    }

    const codes = await generateBackupCodes(10);
    await this.pool.query(
      `UPDATE public.two_factor_secrets
       SET enabled_at = NOW(), backup_codes_hash = $2
       WHERE user_type = 'super_admin' AND user_id = $1`,
      [userId, codes.hashed as unknown as string[]],
    );
    await this.pool.query(
      `UPDATE public.super_admin_users SET two_factor_enabled = TRUE WHERE id = $1`,
      [userId],
    );
    return { backupCodes: codes.plain };
  }

  /** Login sırasında 2FA kodunu doğrula (TOTP veya backup). */
  async verifyTwoFactorCode(userId: Uuid, code: string): Promise<boolean> {
    const r = await this.pool.query<{
      secret_encrypted: string;
      backup_codes_hash: string[];
    }>(
      `SELECT secret_encrypted, backup_codes_hash
       FROM public.two_factor_secrets
       WHERE user_type = 'super_admin' AND user_id = $1 LIMIT 1`,
      [userId],
    );
    const row = r.rows[0];
    if (!row) return false;

    if (verifyTotpCode(code, row.secret_encrypted)) return true;

    // Backup kodu dene
    if (code.match(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2}$/i)) {
      const consumed = await consumeBackupCode(code, row.backup_codes_hash);
      if (consumed.matched) {
        // Kullanılan backup kodunu kaldır
        const remaining = [...row.backup_codes_hash];
        remaining.splice(consumed.index, 1);
        await this.pool.query(
          `UPDATE public.two_factor_secrets SET backup_codes_hash = $2 WHERE user_type = 'super_admin' AND user_id = $1`,
          [userId, remaining],
        );
        return true;
      }
    }
    return false;
  }
}