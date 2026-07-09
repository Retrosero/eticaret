/**
 * İzin (permission) katalogu ve RBAC yardımcıları.
 *
 * Tüm atomik izinler burada tanımlanır. Hem rol hem kullanıcı-özel
 * (custom permission) yetkileri değerlendirmek için tek bir
 * fonksiyon kullanılır: `hasPermission()`.
 *
 * Bu paket framework-bağımsızdır; NestJS / Next.js tüketicileri
 * kendi guard katmanlarını bu fonksiyonlar üzerine kurar.
 */

import type { Uuid } from '@eticart/shared-types';

/**
 * Sistemde tanımlı tüm izin kodları.
 * Yeni bir izin eklenirken buraya eklenmeli, ayrıca veritabanı
 * `permissions` seed tablosuna da yansıtılmalıdır.
 */
export const ALL_PERMISSIONS = [
  // Ürün
  'product:read',
  'product:create',
  'product:update',
  'product:delete',
  'product:import',
  'product:export',
  // Sipariş
  'order:read',
  'order:create',
  'order:update',
  'order:cancel',
  'order:refund',
  // Müşteri
  'customer:read',
  'customer:create',
  'customer:update',
  'customer:delete',
  'customer:export',
  // Stok
  'inventory:read',
  'inventory:update',
  'inventory:transfer',
  // Rapor
  'report:sales',
  'report:financial',
  'report:export',
  // Yönetim
  'settings:read',
  'settings:update',
  'user:read',
  'user:create',
  'user:update',
  'user:delete',
  'role:assign',
  // Entegrasyon
  'integration:read',
  'integration:manage',
  // Pazarlama
  'campaign:read',
  'campaign:manage',
  'coupon:manage',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** Rol için önceden tanımlı izin setleri. */
export const ROLE_PERMISSIONS: Readonly<Record<string, ReadonlyArray<Permission>>> = {
  // Platform sahibi — tüm tenant'ları ve her şeyi yönetir.
  super_admin: [...ALL_PERMISSIONS],

  // Tenant sahibi — kendi tenant'ı içinde her şeyi yapabilir.
  tenant_owner: [...ALL_PERMISSIONS],

  // Tenant yöneticisi — yetki matrisi ile sınırlandırılmış ama geniş.
  tenant_manager: [
    'product:read',
    'product:create',
    'product:update',
    'product:delete',
    'product:export',
    'order:read',
    'order:create',
    'order:update',
    'order:cancel',
    'customer:read',
    'customer:update',
    'customer:export',
    'inventory:read',
    'inventory:update',
    'report:sales',
    'report:financial',
    'report:export',
    'settings:read',
    'user:read',
    'user:create',
    'user:update',
    'integration:read',
    'campaign:read',
    'campaign:manage',
    'coupon:manage',
  ],

  // Ürün yöneticisi
  product_manager: [
    'product:read',
    'product:create',
    'product:update',
    'product:delete',
    'product:import',
    'product:export',
    'inventory:read',
  ],

  // Sipariş sorumlusu
  order_manager: [
    'order:read',
    'order:create',
    'order:update',
    'order:cancel',
    'customer:read',
    'inventory:read',
    'inventory:transfer',
  ],

  // Muhasebe
  accountant: [
    'order:read',
    'order:refund',
    'report:sales',
    'report:financial',
    'report:export',
    'customer:read',
  ],

  // Depo personeli
  warehouse_staff: [
    'inventory:read',
    'inventory:update',
    'inventory:transfer',
    'product:read',
    'order:read',
  ],

  // Pazarlama
  marketing: [
    'campaign:read',
    'campaign:manage',
    'coupon:manage',
    'product:read',
    'customer:read',
    'report:sales',
  ],

  // Destek personeli
  support: ['order:read', 'customer:read', 'customer:update', 'product:read'],

  // B2C müşteri — son kullanıcı (kendi verisi üzerinde)
  customer: ['order:read'],

  // B2B bayi — bayi özel
  dealer: ['order:read', 'order:create'],
} as const;

/**
 * Rolün sahip olduğu izin setini döner. Tanımsız rol için boş set.
 */
export function getRolePermissions(role: string): ReadonlySet<Permission> {
  const list = ROLE_PERMISSIONS[role];
  return new Set<Permission>(list ?? []);
}

/**
 * Kullanıcının sahip olduğu tüm izinleri birleştirir
 * (rol izinleri + custom permissions).
 *
 * @param rolePermissions - kullanıcının rolünden gelen izinler
 * @param customPermissions - kullanıcıya özel ek izinler
 */
export function unionPermissions(
  rolePermissions: ReadonlyArray<Permission>,
  customPermissions: ReadonlyArray<Permission>,
): ReadonlySet<Permission> {
  return new Set<Permission>([...rolePermissions, ...customPermissions]);
}

/**
 * Tek bir izin kontrolü yapar.
 */
export function hasPermission(
  granted: ReadonlySet<Permission>,
  required: Permission,
): boolean {
  return granted.has(required);
}

/**
 * Birden fazla izin kontrolü — `mode=all` ise tümü, `mode=any` ise en az biri.
 */
export function hasPermissions(
  granted: ReadonlySet<Permission>,
  required: ReadonlyArray<Permission>,
  mode: 'all' | 'any' = 'all',
): boolean {
  if (mode === 'all') return required.every((p) => granted.has(p));
  return required.some((p) => granted.has(p));
}

/**
 * Tenant-isolation yardımcısı — kullanıcının tenant_id'si
 * kaynak tenant_id ile aynı olmalı (super_admin istisna).
 *
 * Guard'lar bu fonksiyonu çağırarak "kendi tenant'ımın dışına
 * erişemez" kuralını uygular.
 */
export function isSameTenantOrSuper(
  userTenantId: Uuid | null,
  resourceTenantId: Uuid,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  return userTenantId !== null && userTenantId === resourceTenantId;
}