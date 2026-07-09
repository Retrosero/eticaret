/**
 * RBAC için `@Roles()` dekoratörü ve RolesGuard.
 *
 * Kullanım:
 *   @Roles('tenant_admin', 'order_manager')
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Get() list() { ... }
 *
 * Roller `req.user.role` üzerinden okunur (AccessTokenPayload.role).
 */

import {
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiError, ErrorCode } from '@eticart/config';

export const ROLES_METADATA_KEY = 'roles';

/** İzin verilen rolleri setMetadata ile endpoint'e iliştirir. */
export function Roles(...roles: string[]): MethodDecorator & ClassDecorator {
  return SetMetadata(ROLES_METADATA_KEY, roles) as MethodDecorator & ClassDecorator;
}

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required = this.getRequiredRoles(context);
    if (!required || required.length === 0) {
      // @Roles() yoksa guard geçerli; kimlik doğrulama JwtAuthGuard'ın sorumluluğunda.
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: { role?: string } }>();
    const role = req.user?.role;

    if (!role) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Rol bilgisi eksik.');
    }
    if (!required.includes(role)) {
      throw new ApiError(
        403,
        ErrorCode.FORBIDDEN,
        `Bu işlem için yetkiniz yok. Gerekli roller: ${required.join(', ')}.`,
      );
    }
    return true;
  }

  private getRequiredRoles(ctx: ExecutionContext): string[] | undefined {
    return ctx.getHandler().name
      ? this.reflector(ctx)
      : undefined;
  }

  // NestJS Reflector DI'sini enjekte etmeden basitçe `Reflect.getMetadata` ile okuruz.
  private reflector(ctx: ExecutionContext): string[] | undefined {
    const handlerRoles =
      Reflect.getMetadata(ROLES_METADATA_KEY, ctx.getHandler()) as string[] | undefined;
    if (handlerRoles) return handlerRoles;
    const classRoles =
      Reflect.getMetadata(ROLES_METADATA_KEY, ctx.getClass()) as string[] | undefined;
    return classRoles;
  }
}