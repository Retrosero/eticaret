/**
 * Permission Guard — Belirli bir permission'a sahip olmayı zorunlu kılar.
 *
 * Kullanım:
 *   @RequirePermission('tenant.suspend')
 *   @UseGuards(PermissionGuard)
 *   @Post('tenants/:id/suspend')
 *   async suspend() { ... }
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
import type { SuperAdminPermission, SuperAdminUser } from './rbac.types.js';
import { hasPermission } from './rbac.types.js';

export const REQUIRE_PERMISSION_KEY = 'require_permission';
export const PERMISSIONS_KEY = 'permissions_required';

/** Tek bir permission zorunlu. */
export const RequirePermission = (permission: SuperAdminPermission) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);

/** Birden çok permission'dan en az biri (OR). */
export const RequireAnyPermission = (...permissions: SuperAdminPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, { mode: 'any', permissions });

/** Birden çok permission'ın hepsi (AND). */
export const RequireAllPermissions = (...permissions: SuperAdminPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, { mode: 'all', permissions });

/** Request'ten super admin user'ı al. */
export function getSuperAdminUser(req: Request): SuperAdminUser | null {
  return (req as any).superAdminUser ?? null;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireSingle = this.reflector.get<SuperAdminPermission>(
      REQUIRE_PERMISSION_KEY,
      context.getHandler(),
    );
    const requireMulti = this.reflector.get<{
      mode: 'all' | 'any';
      permissions: SuperAdminPermission[];
    }>(PERMISSIONS_KEY, context.getHandler());

    const required = requireSingle
      ? [requireSingle]
      : requireMulti?.permissions ?? [];

    // Permission gerekmeyen endpoint'ler serbest
    if (required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = getSuperAdminUser(req);
    if (!user) {
      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Super admin authentication gerekli.',
      );
    }
    if (!user.isActive) {
      throw new ApiError(403, ErrorCode.FORBIDDEN, 'Hesap aktif değil.');
    }

    const hasAccess = requireMulti?.mode === 'all'
      ? required.every((p) => hasPermission(user.role, p))
      : required.some((p) => hasPermission(user.role, p));

    if (!hasAccess) {
      throw new ApiError(
        403,
        ErrorCode.FORBIDDEN,
        'Bu işlem için yetkiniz yok.',
      );
    }

    return true;
  }
}
