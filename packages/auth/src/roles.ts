/**
 * Rol-tenant eşleme tip güvenliği.
 * `super_admin` dışındaki tüm rolleri bir tenant'a bağlar.
 */

import type { UserRole, Uuid } from '@eticart/shared-types';

/**
 * Verilen rol için zorunlu tenantId politikası.
 * Dönersa `ok=true`, aksi durumda neden-içeren `ok=false`.
 */
export function checkTenantBinding(
  role: UserRole,
  tenantId: Uuid | null,
): { ok: true } | { ok: false; reason: string } {
  if (role === 'super_admin') {
    if (tenantId !== null) {
      return { ok: false, reason: 'super_admin tenant_id taşımamalıdır.' };
    }
    return { ok: true };
  }
  if (tenantId === null) {
    return {
      ok: false,
      reason: 'super_admin dışındaki roller tenant_id taşımak zorundadır.',
    };
  }
  return { ok: true };
}

/** Tüm bilinen roller (süper admin + firma rolleri + müşteri). */
export const ALL_ROLES = [
  'super_admin',
  'tenant_owner',
  'tenant_admin',
  'tenant_manager',
  'product_manager',
  'order_manager',
  'accountant',
  'warehouse_staff',
  'marketing',
  'support',
  'customer',
  'dealer',
] as const;

export type KnownRole = (typeof ALL_ROLES)[number];

/** Tüm rolleri Türkçe etiketleri ile döner (UI için). */
export const ROLE_LABELS: Readonly<Record<KnownRole, string>> = {
  super_admin: 'Süper Admin',
  tenant_owner: 'Firma Sahibi',
  tenant_admin: 'Firma Yöneticisi',
  tenant_manager: 'Firma Yöneticisi (Matris)',
  product_manager: 'Ürün Yöneticisi',
  order_manager: 'Sipariş Sorumlusu',
  accountant: 'Muhasebe',
  warehouse_staff: 'Depo Personeli',
  marketing: 'Pazarlama',
  support: 'Destek Personeli',
  customer: 'B2C Müşteri',
  dealer: 'B2B Bayi',
};