/**
 * NestJS provider — commerce-backend logger.
 *
 * JWT_SECRET_TOKEN da burada global olarak dışa aktarılır (JwtAuthGuard için).
 */

import { Provider, Inject, Module, Global } from '@nestjs/common';
import { createLogger, type Logger } from '@eticart/config';
import { JWT_SECRET_TOKEN } from './auth.tokens.js';

export const LOGGER_TOKEN = Symbol.for('@eticart/commerce-backend/LOGGER');

export const loggerProvider: Provider = {
  provide: LOGGER_TOKEN,
  useFactory: (): Logger =>
    createLogger({
      service: 'commerce-backend',
      version: process.env['APP_VERSION'] ?? '0.1.0',
    }),
};

/**
 * JWT secret provider — JwtAuthGuard'ın tüm modüllerde DI ile çözümleyebilmesi için.
 * Üretim ortamında JWT_SECRET zorunlu; aksi halde uygulama başlamaz.
 */
export const jwtSecretProvider: Provider = {
  provide: JWT_SECRET_TOKEN,
  useFactory: (): string => {
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      if (process.env['NODE_ENV'] === 'production') {
        throw new Error('JWT_SECRET üretim ortamında zorunludur.');
      }
      // Geliştirme/test fallback'i — en az 32 karakter olmalı (jose HS256 gereksinimi).
      return 'dev-only-jwt-secret-please-change-32+chars';
    }
    return secret;
  },
};

@Global()
@Module({
  providers: [loggerProvider, jwtSecretProvider],
  exports: [LOGGER_TOKEN, JWT_SECRET_TOKEN],
})
export class LoggerModule {}

/** Daha okunaklı kullanım için dekoratör. */
export function InjectLogger(): ParameterDecorator {
  return Inject(LOGGER_TOKEN);
}