/**
 * Auth paketi için DI token'ları.
 *
 * `JWT_SECRET` ortam değişkeninden okunur; JwtAuthGuard bu token üzerinden
 * secret'a erişir. `AuthModule` sağlayıcı olarak `useFactory` ile secret'ı
 * environment'tan çeker ve modül DI container'ına yazar.
 */

import { Inject } from '@nestjs/common';

export const JWT_SECRET_TOKEN = Symbol.for('@eticart/commerce-backend/JWT_SECRET');

/** Secret provider için okunabilir dekoratör. */
export function InjectJwtSecret(): ParameterDecorator {
  return Inject(JWT_SECRET_TOKEN);
}