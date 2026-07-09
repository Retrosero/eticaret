/**
 * JWT authentication guard.
 *
 * Authorization başlığından Bearer token alır, doğrular ve
 * `req.authUser` içine principal yazar. Tüm auth gerektiren
 * endpoint'ler bu guard'ı kullanır.
 *
 * `@Public()` ile işaretlenmiş uçlar bypass edilir.
 */

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { verifyAccessToken } from '@eticart/auth';

import { LOGGER_TOKEN } from '../../common/logger.js';
import { PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthPrincipal, Identity } from '../types/auth-principal.js';
import { SessionStore } from '../services/auth-core.service.js';
import { PermissionLoaderService } from '../services/permission-loader.service.js';

declare module 'express' {
  interface Request {
    authUser?: AuthPrincipal;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
    private readonly sessions: SessionStore,
    private readonly permissionLoader: PermissionLoaderService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(req);
    if (!token) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Yetkilendirme gerekli.');
    }

    const secret = process.env['JWT_SECRET'];
    if (!secret || secret.length < 32) {
      throw new ApiError(
        500,
        ErrorCode.INTERNAL_SERVER_ERROR,
        'JWT_SECRET en az 32 karakter olmalıdır.',
      );
    }

    const payload = await verifyAccessToken(token, secret);
    if (!payload) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Belirteç geçersiz veya süresi dolmuş.');
    }

    // Oturum hâlâ aktif mi?
    const session = await this.sessions.findById(payload.sessionId);
    if (!session || session.revokedAt) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Oturum sona ermiş.');
    }

    // DB'den rol/permission'ları çek (refresh rotation'dan sonra değişmiş olabilir)
    const permissions = await this.permissionLoader.loadPermissions(
      payload.identity as Identity,
      payload.sub,
      payload.tenantId,
    );

    const principal: AuthPrincipal = {
      identity: payload.identity as Identity,
      userId: payload.sub,
      email: '', // gerekirse DB'den çekilebilir
      role: payload.role,
      tenantId: payload.tenantId,
      sessionId: payload.sessionId,
      twoFactorVerified: payload.twoFactorVerified ?? false,
      permissions,
    };
    req.authUser = principal;

    // Son aktif zamanı güncelle (en iyi çaba — hata loglanır ama isteği durdurmaz)
    this.sessions.touch(payload.sessionId).catch((err) => {
      this.logger.warn({ err }, 'Session touch hatası');
    });

    return true;
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers['authorization'];
    if (!header || typeof header !== 'string') return null;
    const m = /^Bearer\s+(.+)$/i.exec(header);
    return m && m[1] ? m[1] : null;
  }
}