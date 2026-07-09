/**
 * RBAC + SSO — unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getPermissions,
  ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
} from '../rbac.types.js';
import { SsoService } from '../sso.service.js';

describe('RBAC', () => {
  describe('hasPermission()', () => {
    it('super_owner tüm permissionlara sahip', () => {
      expect(hasPermission('super_owner', 'tenant.suspend')).toBe(true);
      expect(hasPermission('super_owner', 'admin.delete')).toBe(true);
      expect(hasPermission('super_owner', 'plugin.approve')).toBe(true);
    });

    it('super_admin tanımlı permissionlara sahip', () => {
      expect(hasPermission('super_admin', 'tenant.suspend')).toBe(true);
      expect(hasPermission('super_admin', 'admin.create')).toBe(true);
    });

    it('super_admin olmayan permissionlara sahip değil', () => {
      expect(hasPermission('super_admin', 'admin.delete')).toBe(false);
    });

    it('viewer sadece okuma permissionlarına sahip', () => {
      expect(hasPermission('viewer', 'tenant.list')).toBe(true);
      expect(hasPermission('viewer', 'tenant.suspend')).toBe(false);
      expect(hasPermission('viewer', 'admin.create')).toBe(false);
    });

    it('support_agent sadece support permissionlarına sahip', () => {
      expect(hasPermission('support_agent', 'support.ticket.respond')).toBe(true);
      expect(hasPermission('support_agent', 'tenant.suspend')).toBe(false);
      expect(hasPermission('support_agent', 'plan.create')).toBe(false);
    });

    it('finance sadece finance permissionlarına sahip', () => {
      expect(hasPermission('finance', 'subscription.refund')).toBe(true);
      expect(hasPermission('finance', 'support.ticket.respond')).toBe(false);
    });

    it('developer sadece technical/analytics permissionlarına sahip', () => {
      expect(hasPermission('developer', 'audit.read')).toBe(true);
      expect(hasPermission('developer', 'analytics.read')).toBe(true);
      expect(hasPermission('developer', 'tenant.suspend')).toBe(false);
    });
  });

  describe('hasAllPermissions()', () => {
    it('AND kontrolü — tüm varsa true', () => {
      expect(
        hasAllPermissions('super_admin', [
          'tenant.suspend',
          'plan.create',
          'audit.read',
        ]),
      ).toBe(true);
    });

    it('AND kontrolü — bir yoksa false', () => {
      expect(
        hasAllPermissions('super_admin', [
          'tenant.suspend',
          'admin.delete', // super_admin'da yok
        ]),
      ).toBe(false);
    });

    it('boş array true döner', () => {
      expect(hasAllPermissions('viewer', [])).toBe(true);
    });
  });

  describe('hasAnyPermission()', () => {
    it('OR kontrolü — bir varsa true', () => {
      expect(
        hasAnyPermission('viewer', [
          'tenant.suspend', // yok
          'tenant.list',    // var
        ]),
      ).toBe(true);
    });

    it('OR kontrolü — hiç yoksa false', () => {
      expect(
        hasAnyPermission('viewer', [
          'admin.delete',
          'tenant.suspend',
        ]),
      ).toBe(false);
    });
  });

  describe('getPermissions()', () => {
    it('super_owner tüm permissions', () => {
      const perms = getPermissions('super_owner');
      expect(perms.length).toBe(ALL_PERMISSIONS.length);
    });

    it('super_admin subset', () => {
      const perms = getPermissions('super_admin');
      expect(perms.length).toBeLessThan(ALL_PERMISSIONS.length);
      expect(perms.length).toBeGreaterThan(0);
    });

    it('viewer minimal', () => {
      const perms = getPermissions('viewer');
      expect(perms.length).toBeGreaterThan(0);
      expect(perms.length).toBeLessThan(10);
    });
  });

  describe('Role mapping consistency', () => {
    it('her rol en az 1 permissiona sahip', () => {
      for (const role of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>) {
        expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
      }
    });

    it('super_owner hariç rollerin permissionları ALL_PERMISSIONS\'dan', () => {
      const allSet = new Set(ALL_PERMISSIONS);
      for (const role of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>) {
        if (role === 'super_owner') continue;
        for (const p of ROLE_PERMISSIONS[role]) {
          expect(allSet.has(p)).toBe(true);
        }
      }
    });
  });
});

describe('SsoService', () => {
  let service: SsoService;
  const mockPool: any = {
    query: vi.fn(),
  };
  const mockLogger: any = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockReset();
    service = new SsoService(mockLogger, mockPool);
  });

  describe('getGoogleLoginUrl()', () => {
    it('CLIENT_ID yoksa → 503', () => {
      delete process.env['GOOGLE_CLIENT_ID'];
      expect(() => service.getGoogleLoginUrl('state', 'redirect')).toThrow();
    });

    it('CLIENT_ID varsa → URL döner', () => {
      process.env['GOOGLE_CLIENT_ID'] = 'test-client-id';
      const url = service.getGoogleLoginUrl('state-1', 'https://app/cb');
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('state=state-1');
      expect(url).toContain('redirect_uri=');
    });
  });

  describe('getMicrosoftLoginUrl()', () => {
    it('CLIENT_ID varsa → URL döner', () => {
      process.env['MS_CLIENT_ID'] = 'ms-client-id';
      const url = service.getMicrosoftLoginUrl('state-2', 'https://app/cb');
      expect(url).toContain('login.microsoftonline.com');
      expect(url).toContain('client_id=ms-client-id');
    });

    it('CLIENT_ID yoksa → 503', () => {
      delete process.env['MS_CLIENT_ID'];
      expect(() => service.getMicrosoftLoginUrl('s', 'r')).toThrow();
    });
  });

  describe('handleCallback()', () => {
    it('client secret yoksa → 503', async () => {
      delete process.env['GOOGLE_CLIENT_ID'];
      delete process.env['GOOGLE_CLIENT_SECRET'];
      await expect(
        service.handleCallback('google', 'code', 'https://app/cb'),
      ).rejects.toMatchObject({ statusCode: 503 });
    });
  });

  describe('resolveSession()', () => {
    it('token yoksa null', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.resolveSession('bad-token');
      expect(result).toBeNull();
    });

    it('geçerli token → session döner', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sess-1',
            user_id: 'u-1',
            email: 'admin@eticart.com.tr',
            role: 'super_admin',
            two_factor_verified: true,
            ip: '127.0.0.1',
            user_agent: 'Mozilla',
            created_at: new Date(),
            expires_at: new Date(Date.now() + 3600 * 1000),
            revoked_at: null,
            revoked_reason: null,
          },
        ],
      });
      const result = await service.resolveSession('valid-token');
      expect(result?.id).toBe('sess-1');
      expect(result?.email).toBe('admin@eticart.com.tr');
      expect(result?.permissions).toBeDefined();
      expect(result?.permissions.length).toBeGreaterThan(0);
    });
  });

  describe('revokeSession()', () => {
    it('session revoke', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      const result = await service.revokeSession('sess-1', 'admin_action');
      expect(result).toBe(true);
    });

    it('olmayan session → false', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      const result = await service.revokeSession('nonexistent', 'reason');
      expect(result).toBe(false);
    });
  });

  describe('listUserSessions()', () => {
    it('aktif session listesi', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 's-1',
            user_id: 'u-1',
            ip: '1.2.3.4',
            user_agent: 'X',
            created_at: new Date(),
            expires_at: new Date(Date.now() + 3600 * 1000),
          },
        ],
      });
      const result = await service.listUserSessions('u-1');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('s-1');
    });
  });
});
