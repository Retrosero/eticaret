/**
 * Permission yükleyici — kullanıcının rol + custom izin birleşimini
 * DB'den çeker.
 *
 * `permissions` ve `role_permissions` + `user_roles` +
 * `user_custom_permissions` tablolarını sorgular.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Uuid } from '@eticart/shared-types';
import type { Identity } from '@eticart/auth';

@Injectable()
export class PermissionLoaderService {
  constructor(@Inject('PG_POOL_TOKEN') private readonly pool: Pool) {}

  /**
   * Kullanıcının tüm izin kodlarını döner (rol izinleri + custom).
   */
  async loadPermissions(
    identity: Identity,
    userId: Uuid,
    tenantId: Uuid | null,
  ): Promise<ReadonlyArray<string>> {
    const rolePerms = await this.loadRolePermissions(identity, userId, tenantId);
    const customPerms = await this.loadCustomPermissions(identity, userId, tenantId);
    return Array.from(new Set([...rolePerms, ...customPerms]));
  }

  private async loadRolePermissions(
    identity: Identity,
    userId: Uuid,
    tenantId: Uuid | null,
  ): Promise<ReadonlyArray<string>> {
    // user_roles → roles → role_permissions → permissions
    const r = await this.pool.query<{ code: string }>(
      `SELECT p.code
       FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
       JOIN public.role_permissions rp ON rp.role_id = r.id
       JOIN public.permissions p ON p.id = rp.permission_id
       WHERE ur.user_type = $1 AND ur.user_id = $2
         AND (ur.tenant_id = $3 OR ($3::uuid IS NULL AND ur.tenant_id IS NULL))`,
      [identity, userId, tenantId],
    );
    return r.rows.map((row) => row.code);
  }

  private async loadCustomPermissions(
    identity: Identity,
    userId: Uuid,
    tenantId: Uuid | null,
  ): Promise<ReadonlyArray<string>> {
    const r = await this.pool.query<{ code: string }>(
      `SELECT p.code
       FROM public.user_custom_permissions ucp
       JOIN public.permissions p ON p.id = ucp.permission_id
       WHERE ucp.user_type = $1 AND ucp.user_id = $2
         AND (ucp.tenant_id = $3 OR ($3::uuid IS NULL AND ucp.tenant_id IS NULL))
         AND (ucp.expires_at IS NULL OR ucp.expires_at > NOW())`,
      [identity, userId, tenantId],
    );
    return r.rows.map((row) => row.code);
  }
}