/**
 * `@RequirePermissions()` dekoratörü — handler veya controller
 * seviyesinde izin gereksinimi tanımlar. `@PermissionsGuard()` ile
 * birlikte kullanılır.
 *
 * @example
 *   @RequirePermissions('order:read')
 *   @Get()
 *   list() { ... }
 *
 *   @RequirePermissions('product:read', 'product:create', { mode: 'all' })
 *   @Post()
 *   create() { ... }
 */

import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_METADATA_KEY = 'auth:required_permissions';

export type PermissionRequirement = string | { code: string; mode?: 'all' | 'any' };

export interface PermissionsMetadata {
  permissions: ReadonlyArray<PermissionRequirement>;
  mode: 'all' | 'any';
}

/**
 * Gerekli permission'ları metadata'ya yazar.
 *
 * @param perms - izin kodları veya modlu gereksinimler
 * @param mode - 'all' (tümü gerekli) veya 'any' (bir tanesi yeterli)
 */
export const RequirePermissions = (
  ...perms: ReadonlyArray<PermissionRequirement>
): MethodDecorator & ClassDecorator => {
  const mode = 'all';
  const normalized: PermissionsMetadata = { permissions: perms, mode };
  return SetMetadata(PERMISSIONS_METADATA_KEY, normalized);
};

/** "Herhangi biri yeterli" modunda izin listesi tanımlar. */
export const RequireAnyPermission = (
  ...perms: ReadonlyArray<string>
): MethodDecorator & ClassDecorator => {
  const normalized: PermissionsMetadata = { permissions: perms, mode: 'any' };
  return SetMetadata(PERMISSIONS_METADATA_KEY, normalized);
};