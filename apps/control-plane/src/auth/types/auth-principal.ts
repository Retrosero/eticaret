/**
 * Kimlik doğrulama sonrası route handler'a geçirilen principal tipi.
 *
 * Üç kimlik alanı (super_admin, tenant, customer) için ortak sözleşme:
 * - `identity` alanı hangi guard'ın çalıştığını belirtir
 * - `userId` alanı ilgili tablodaki UUID'dir
 * - `tenantId` super_admin için null, customer için bağlı olduğu tenant
 * - `role` tabloya göre değişir (super_admin | tenant_owner | vs.)
 * - `sessionId` aktif oturum kimliğidir
 */

import type { Uuid } from '@eticart/shared-types';

export type Identity = 'super_admin' | 'tenant' | 'customer';

export interface AuthPrincipal {
  identity: Identity;
  userId: Uuid;
  email: string;
  role: string;
  tenantId: Uuid | null;
  sessionId: Uuid;
  twoFactorVerified: boolean;
  /** Verilen tüm permission kodları (rol + custom birleşik). */
  permissions: ReadonlyArray<string>;
}