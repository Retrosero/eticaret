/**
 * `@CurrentUser()` parametre dekoratörü — JwtAuthGuard sonrası
 * `req.user` (AccessTokenPayload) tipini route handler'a aktarır.
 */

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AccessTokenPayload } from '@eticart/auth';
import type { RequestWithTenant } from './tenant-resolver.middleware.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithTenant & { user?: AccessTokenPayload }>();
    if (!req.user) return undefined;
    if (!req.tenantContext) return req.user;
    return { ...req.user, tenantId: req.tenantContext.tenantId };
  },
);
