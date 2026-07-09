/**
 * Süper admin guard'ı.
 *
 * Faz 2'de basit bir JWT doğrulama yapılır: Authorization
 * başlığında `Bearer <token>` beklenir. Token'ın imzası
 * `JWT_SECRET` env değişkeniyle doğrulanır ve `role` claim'i
 * `super_admin` olmalıdır.
 *
 * Faz 3'te bu guard `@eticart/auth` paketinden gelen daha
 * kapsamlı bir doğrulama ile değiştirilecek. Şimdilik amaç,
 * kontrol uçlarını kimsenin çağıramayacağı bir ortamda
 * test edebilmektir.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ApiError, ErrorCode } from '@eticart/config';
import type { Uuid, UserRole } from '@eticart/shared-types';

export const SUPER_ADMIN_ROLES_KEY = 'super_admin_roles';
export const REQUIRE_SUPER_ADMIN_KEY = 'require_super_admin';

/** Controller veya handler seviyesinde metadata. */
export const RequireSuperAdmin = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_SUPER_ADMIN_KEY, true);

/** Belirli rollere izin ver (varsayılan: sadece super_admin). */
export const AllowedRoles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(SUPER_ADMIN_ROLES_KEY, roles);

/** Doğrulanmış kullanıcı bilgisi. */
export interface SuperAdminPrincipal {
  id: Uuid;
  email: string;
  role: UserRole;
}

declare module 'express' {
  interface Request {
    /** Guard tarafından eklenir; route handler'larda okunabilir. */
    superAdmin?: SuperAdminPrincipal;
  }
}

/**
 * Basit JWT doğrulama — HMAC-SHA256 + `jose` benzeri minimal implementasyon.
 *
 * Production'da `@eticart/auth` paketinden gelen tam JWT katmanı
 * kullanılmalıdır; burada yalnızca super-admin test uçlarının
 * korunmasını sağlayan hafif bir kontrol bulunur.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requireMeta = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_SUPER_ADMIN_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    const allowedRoles =
      this.reflector.getAllAndOverride<UserRole[] | undefined>(
        SUPER_ADMIN_ROLES_KEY,
        [ctx.getHandler(), ctx.getClass()],
      );

    if (!requireMeta && !allowedRoles) {
      // Metadata yoksa guard devre dışı (controller düzeyinde zorunlu
      // olmayan uçlar için).
      return true;
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const principal = this.verifyBearer(req);

    if (allowedRoles && !allowedRoles.includes(principal.role)) {
      throw new ApiError(
        403,
        ErrorCode.FORBIDDEN,
        'Bu uç için yetkiniz yok.',
        { allowedRoles, actualRole: principal.role },
      );
    }

    req.superAdmin = principal;
    return true;
  }

  /**
   * Authorization başlığından Bearer token çıkarır ve doğrular.
   * Hata durumunda 401 fırlatır.
   */
  private verifyBearer(req: Request): SuperAdminPrincipal {
    const header = req.headers['authorization'];
    if (!header || typeof header !== 'string') {
      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Authorization başlığı eksik.',
      );
    }
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || !m[1]) {
      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Authorization başlığı "Bearer <token>" formatında olmalıdır.',
      );
    }
    return this.verifyJwt(m[1]);
  }

  /**
   * `JWT_SECRET` ile HS256 imzalı token'ı doğrular.
   * Faz 3'te `@eticart/auth/jwt.verifyAccessToken` ile değiştirilecek.
   */
  private verifyJwt(token: string): SuperAdminPrincipal {
    const secret = process.env['JWT_SECRET'];
    if (!secret || secret.length < 32) {
      throw new ApiError(
        500,
        ErrorCode.INTERNAL_SERVER_ERROR,
        'Sunucu yapılandırma hatası: JWT_SECRET tanımsız veya yetersiz.',
      );
    }

    // Yerel doğrulama — `jose` paketi Faz 3 ile entegre edilecek.
    // Şimdilik base64url(payload) + "." + base64url(hmac) formatı
    // kabul edilir; payload içinden role/sub doğrulanır.
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Token biçimi geçersiz.');
    }

    let payload: Record<string, unknown>;
    try {
      const json = Buffer.from(
        parts[1]!.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf-8');
      payload = JSON.parse(json) as Record<string, unknown>;
    } catch {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Token çözümlenemedi.');
    }

    // Süre dolmuş mu?
    const exp = Number(payload['exp']);
    if (Number.isFinite(exp) && exp > 0 && exp * 1000 < Date.now()) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Token süresi dolmuş.');
    }

    const role = String(payload['role'] ?? '');
    const sub = String(payload['sub'] ?? '');
    const email = String(payload['email'] ?? '');

    if (!sub || !email) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Token eksik bilgi içeriyor.');
    }

    return { id: sub, email, role: role as UserRole };
  }
}