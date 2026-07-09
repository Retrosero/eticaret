/**
 * JWT kimlik doğrulama guard'ı.
 *
 * `Authorization: Bearer <token>` başlığından JWT'yi alır, `@eticart/auth`'tan
 * `verifyAccessToken` ile doğrular ve çözülen payload'ı `req.user`'a yazar.
 *
 * Başarısız doğrulamada 401 ApiError fırlatır (global filter JSON'a çevirir).
 */

import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '@eticart/auth';
import { ApiError, ErrorCode } from '@eticart/config';

import { InjectJwtSecret, JWT_SECRET_TOKEN } from './auth.tokens.js';

/** Express request'in `user` eklentisi. */
export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @InjectJwtSecret()
    private readonly secret: string,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Kimlik doğrulama başlığı eksik.');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Kimlik doğrulama token alanı boş.');
    }

    const payload = await verifyAccessToken(token, this.secret);
    if (!payload) {
      // Audit log — başarısız token doğrulama
      const { Audit } = await import('./audit.service.js');
      Audit.record({
        action: 'token.invalid',
        severity: 'warning',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        context: { path: req.path, method: req.method },
      });
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Geçersiz veya süresi dolmuş token.');
    }

    req.user = payload;
    return true;
  }
}

/** Token çözümleyici için secret DI token'ı. */
export { JWT_SECRET_TOKEN };