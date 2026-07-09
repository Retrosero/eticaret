/**
 * RBAC permission testleri.
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_PERMISSIONS,
  getRolePermissions,
  hasPermission,
  hasPermissions,
  isSameTenantOrSuper,
  unionPermissions,
  ROLE_PERMISSIONS,
} from './index.js';

describe('ALL_PERMISSIONS', () => {
  it('en az 30 izin içerir', () => {
    expect(ALL_PERMISSIONS.length).toBeGreaterThanOrEqual(30);
  });

  it('tüm yaygın kategoriler var', () => {
    expect(ALL_PERMISSIONS).toContain('product:read');
    expect(ALL_PERMISSIONS).toContain('order:refund');
    expect(ALL_PERMISSIONS).toContain('customer:export');
    expect(ALL_PERMISSIONS).toContain('inventory:transfer');
    expect(ALL_PERMISSIONS).toContain('report:financial');
    expect(ALL_PERMISSIONS).toContain('campaign:manage');
  });
});

describe('getRolePermissions', () => {
  it('super_admin tüm izinlere sahip', () => {
    const set = getRolePermissions('super_admin');
    for (const p of ALL_PERMISSIONS) {
      expect(set.has(p)).toBe(true);
    }
  });

  it('customer sadece order:read içerir', () => {
    const set = getRolePermissions('customer');
    expect(set.size).toBeGreaterThan(0);
    expect(set.has('order:read')).toBe(true);
    expect(set.has('product:delete')).toBe(false);
  });

  it('tanımsız rol boş set döner', () => {
    const set = getRolePermissions('unknown_role_xyz');
    expect(set.size).toBe(0);
  });
});

describe('hasPermission & hasPermissions', () => {
  it('tek izin kontrolü', () => {
    const set = getRolePermissions('tenant_owner');
    expect(hasPermission(set, 'order:cancel')).toBe(true);
    expect(hasPermission(set, 'integration:manage')).toBe(true);
  });

  it('all modunda tüm izinler gerekli', () => {
    const set = getRolePermissions('order_manager');
    expect(hasPermissions(set, ['order:read', 'order:cancel'], 'all')).toBe(true);
    expect(hasPermissions(set, ['order:read', 'integration:manage'], 'all')).toBe(false);
  });

  it('any modunda bir izin yeterli', () => {
    const set = getRolePermissions('support');
    expect(hasPermissions(set, ['integration:manage', 'order:read'], 'any')).toBe(true);
    expect(hasPermissions(set, ['integration:manage', 'product:delete'], 'any')).toBe(false);
  });
});

describe('unionPermissions', () => {
  it('rol + custom birleşimi', () => {
    const set = unionPermissions(['order:read'], ['integration:manage']);
    expect(hasPermission(set, 'order:read')).toBe(true);
    expect(hasPermission(set, 'integration:manage')).toBe(true);
    expect(hasPermission(set, 'product:delete')).toBe(false);
  });
});

describe('isSameTenantOrSuper', () => {
  it('super_admin her tenant\'a erişebilir', () => {
    expect(isSameTenantOrSuper(null, '11111111-1111-1111-1111-111111111111', true)).toBe(true);
  });

  it('tenant user kendi tenant\'ına erişebilir', () => {
    const tid = '11111111-1111-1111-1111-111111111111';
    expect(isSameTenantOrSuper(tid, tid, false)).toBe(true);
  });

  it('tenant user başka tenant\'a erişemez', () => {
    expect(
      isSameTenantOrSuper(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        false,
      ),
    ).toBe(false);
  });
});

describe('ROLE_PERMISSIONS bütünlüğü', () => {
  it('tüm rol izin kümeleri yalnızca tanımlı izinler içerir', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        expect(ALL_PERMISSIONS).toContain(p);
      }
      void role;
    }
  });
});