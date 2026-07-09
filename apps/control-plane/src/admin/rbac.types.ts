/**
 * Super Admin RBAC — Type definitions.
 *
 * Roller ve izinler tip tanımları. Permission key'leri `resource.action` formatında.
 */

/** Tüm super admin rolleri. */
export type SuperAdminRole =
  | 'super_owner'    // Tam yetki (süper admin sahibi)
  | 'super_admin'    // Tüm platform aksiyonları
  | 'support_agent'  // Ticket + tenant iletişim
  | 'finance'        // Fatura, plan, payment
  | 'developer'      // Debug, log, metric
  | 'viewer';        // Sadece okuma

/** Tüm permission key'leri. */
export type SuperAdminPermission =
  // Tenant
  | 'tenant.list'
  | 'tenant.read'
  | 'tenant.suspend'
  | 'tenant.reactivate'
  | 'tenant.archive'
  | 'tenant.delete'
  // Plan
  | 'plan.list'
  | 'plan.create'
  | 'plan.update'
  | 'plan.deactivate'
  // Subscription
  | 'subscription.list'
  | 'subscription.read'
  | 'subscription.cancel'
  | 'subscription.refund'
  // Audit
  | 'audit.read'
  // Analytics
  | 'analytics.read'
  // Support
  | 'support.ticket.read'
  | 'support.ticket.respond'
  | 'support.ticket.assign'
  | 'support.ticket.close'
  | 'support.stats.read'
  // Admin yönetimi
  | 'admin.list'
  | 'admin.create'
  | 'admin.update'
  | 'admin.delete'
  | 'admin.role.assign'
  // Settings
  | 'settings.read'
  | 'settings.update'
  // Plugin yönetimi
  | 'plugin.approve'
  | 'plugin.reject';

/** Rol → Permission mapping. */
export const ROLE_PERMISSIONS: Record<SuperAdminRole, ReadonlyArray<SuperAdminPermission>> = {
  super_owner: [
    // Tüm permissions (aşağıda wildcard ile)
    ...'__all__' as unknown as SuperAdminPermission[],
  ],
  super_admin: [
    'tenant.list', 'tenant.read', 'tenant.suspend', 'tenant.reactivate', 'tenant.archive',
    'plan.list', 'plan.create', 'plan.update', 'plan.deactivate',
    'subscription.list', 'subscription.read', 'subscription.cancel', 'subscription.refund',
    'audit.read', 'analytics.read',
    'support.ticket.read', 'support.ticket.respond', 'support.ticket.assign', 'support.ticket.close', 'support.stats.read',
    'admin.list', 'admin.create', 'admin.update', 'admin.role.assign',
    'settings.read', 'settings.update',
    'plugin.approve', 'plugin.reject',
  ],
  support_agent: [
    'tenant.list', 'tenant.read',
    'support.ticket.read', 'support.ticket.respond', 'support.ticket.assign', 'support.ticket.close', 'support.stats.read',
    'analytics.read',
  ],
  finance: [
    'tenant.list', 'tenant.read',
    'plan.list', 'plan.create', 'plan.update', 'plan.deactivate',
    'subscription.list', 'subscription.read', 'subscription.cancel', 'subscription.refund',
    'analytics.read', 'audit.read',
  ],
  developer: [
    'tenant.list', 'tenant.read',
    'audit.read', 'analytics.read',
    'settings.read', 'settings.update',
  ],
  viewer: [
    'tenant.list', 'tenant.read',
    'plan.list', 'subscription.list', 'subscription.read',
    'analytics.read',
  ],
};

/** Wildcard permission (super_owner). */
export const ALL_PERMISSIONS: SuperAdminPermission[] = [
  'tenant.list', 'tenant.read', 'tenant.suspend', 'tenant.reactivate', 'tenant.archive', 'tenant.delete',
  'plan.list', 'plan.create', 'plan.update', 'plan.deactivate',
  'subscription.list', 'subscription.read', 'subscription.cancel', 'subscription.refund',
  'audit.read', 'analytics.read',
  'support.ticket.read', 'support.ticket.respond', 'support.ticket.assign', 'support.ticket.close', 'support.stats.read',
  'admin.list', 'admin.create', 'admin.update', 'admin.delete', 'admin.role.assign',
  'settings.read', 'settings.update',
  'plugin.approve', 'plugin.reject',
];

/** Super admin user. */
export interface SuperAdminUser {
  id: string;
  email: string;
  fullName: string;
  role: SuperAdminRole;
  twoFactorEnabled: boolean;
  ssoProvider: 'google' | 'microsoft' | 'local';
  ssoSubject: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

/** Aktif session. */
export interface SuperAdminSession {
  id: string;
  userId: string;
  email: string;
  role: SuperAdminRole;
  permissions: SuperAdminPermission[];
  twoFactorVerified: boolean;
  ip: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

/**
 * Permission check: role'ün belirli bir permission'a sahip mi?
 */
export function hasPermission(
  role: SuperAdminRole,
  permission: SuperAdminPermission,
): boolean {
  if (role === 'super_owner') return true;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Role'ün tüm permission'ları.
 */
export function getPermissions(role: SuperAdminRole): SuperAdminPermission[] {
  if (role === 'super_owner') return ALL_PERMISSIONS;
  return [...ROLE_PERMISSIONS[role]];
}

/**
 * Permission check: tüm permissions'a sahip mi (AND)?
 */
export function hasAllPermissions(
  role: SuperAdminRole,
  permissions: SuperAdminPermission[],
): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Permission check: en az bir permission'a sahip mi (OR)?
 */
export function hasAnyPermission(
  role: SuperAdminRole,
  permissions: SuperAdminPermission[],
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}
