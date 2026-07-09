/**
 * Permissions guard — `@RequirePermissions()` ile tanımlanmış
 * izin gereksinimlerini kontrol eder.
 *
 * `@Public()` ile birlikte çalışmaz; yalnızca `JwtAuthGuard`
 * sonrası çalıştırılmalıdır.
 */

import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError, ErrorCode } from '@eticart/config';

import type { AuthPrincipal } from '../types/auth-principal.js';
import {
  PERMISSIONS_METADATA_KEY,
  type PermissionsMetadata,
  type PermissionRequirement,
} from '../decorators/permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<PermissionsMetadata | undefined>(
      PERMISSIONS_METADATA_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!meta) return true;

    const req = ctx.switchToHttp().getRequest<{ authUser?: AuthPrincipal }>();
    const principal = req.authUser;
    if (!principal) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Önce kimlik doğrulaması gerekiyor.');
    }

    const granted = new Set<string>(principal.permissions);

    if (meta.mode === 'all') {
      const missing = meta.permissions.filter((p) => {
        const code = typeof p === 'string' ? p : p.code;
        return !granted.has(code);
      });
      if (missing.length > 0) {
        throw new ApiError(
          403,
          ErrorCode.FORBIDDEN,
          'Bu işlem için gerekli izinlere sahip değilsiniz.',
          { missing },
        );
      }
    } else {
      const allowed = meta.permissions.some((p) => {
        const code = typeof p === 'string' ? p : p.code;
        return granted.has(code);
      });
      if (!allowed) {
        throw new ApiError(
          403,
          ErrorCode.FORBIDDEN,
          'Bu işlem için gerekli izinlerden en az birine sahip olmalısınız.',
          { required: meta.permissions },
        );
      }
    }

    return true;
  }
}

/** Tenant bağlam kontrolü — kullanıcının tenant_id'si resource ile eşleşmeli. */
@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<{ authUser?: AuthPrincipal; params: Record<string, string> }>();
    const principal = req.authUser;
    if (!principal) return true; // önceki guard halleder

    // URL'den tenantId parametresini al
    const paramTenantId = req.params['tenantId'] ?? null;
    if (!paramTenantId) return true;

    if (principal.role === 'super_admin') return true;

    if (principal.tenantId !== paramTenantId) {
      throw new ForbiddenException('Bu tenant\'a erişim yetkiniz yok.');
    }
    return true;
  }
}

void PermissionRequirement;