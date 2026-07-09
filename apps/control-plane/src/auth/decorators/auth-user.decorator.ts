/**
 * `@CurrentUser()` dekoratörü — guard sonrası route handler'ında
 * doğrulanmış kullanıcıyı okumak için kullanılır.
 */

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthPrincipal } from '../types/auth-principal.js';

/** Request'ten `req.authUser` (guard tarafından set edilen) alanını okur. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { authUser?: AuthPrincipal }>();
    return req.authUser;
  },
);