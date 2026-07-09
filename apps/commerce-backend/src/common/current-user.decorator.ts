/**
 * `@CurrentUser()` parametre dekoratörü — JwtAuthGuard sonrası
 * `req.user` (AccessTokenPayload) tipini route handler'a aktarır.
 */

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AccessTokenPayload } from '@eticart/auth';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: AccessTokenPayload }>();
    return req.user;
  },
);