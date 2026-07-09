/**
 * Kullanıcı ve RBAC tipleri — Faz 3 iskeleti.
 */

import type { Uuid, IsoDateString } from '../common/index.js';

/** Kullanıcı rolleri. */
export type UserRole =
  | 'super_admin' // SaaS operatörü
  | 'tenant_owner' // Mağaza sahibi
  | 'tenant_admin' // Mağaza yöneticisi
  | 'tenant_staff' // Mağaza çalışanı
  | 'customer'; // Son müşteri

/** Kullanıcı ana verisi. */
export interface User {
  id: Uuid;
  email: string; // loglanmaz, maskelenir
  fullName: string;
  role: UserRole;
  tenantId: Uuid | null; // null ise super_admin
  emailVerified: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Yetkilendirme talepleri. */
export type Permission =
  | 'tenant:read'
  | 'tenant:write'
  | 'tenant:delete'
  | 'products:read'
  | 'products:write'
  | 'orders:read'
  | 'orders:write'
  | 'billing:read'
  | 'billing:write'
  | 'super:tenants:read'
  | 'super:tenants:write';
