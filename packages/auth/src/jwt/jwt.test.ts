/**
 * JWT imzalama ve doğrulama testleri.
 */

import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './index.js';

const SECRET = 'test-secret-32chars-minimum-length-test';

describe('access token', () => {
  it('imzalanır ve doğrulanır', async () => {
    const token = await signAccessToken(
      {
        sub: '11111111-1111-1111-1111-111111111111',
        role: 'tenant_owner',
        tenantId: '22222222-2222-2222-2222-222222222222',
        identity: 'tenant',
        sessionId: '33333333-3333-3333-3333-333333333333',
        twoFactorVerified: true,
      },
      SECRET,
      { expiresInSeconds: 60 },
    );

    expect(token.split('.')).toHaveLength(3);

    const payload = await verifyAccessToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('11111111-1111-1111-1111-111111111111');
    expect(payload?.role).toBe('tenant_owner');
    expect(payload?.identity).toBe('tenant');
    expect(payload?.twoFactorVerified).toBe(true);
  });

  it('süresi dolmuş token null döner', async () => {
    const token = await signAccessToken(
      {
        sub: '11111111-1111-1111-1111-111111111111',
        role: 'customer',
        tenantId: null,
        identity: 'customer',
        sessionId: '33333333-3333-3333-3333-333333333333',
        twoFactorVerified: false,
      },
      SECRET,
      { expiresInSeconds: -10 }, // süresi geçmiş
    );

    const payload = await verifyAccessToken(token, SECRET);
    expect(payload).toBeNull();
  });

  it('yanlış secret ile doğrulama null döner', async () => {
    const token = await signAccessToken(
      {
        sub: '11111111-1111-1111-1111-111111111111',
        role: 'customer',
        tenantId: null,
        identity: 'customer',
        sessionId: '33333333-3333-3333-3333-333333333333',
        twoFactorVerified: false,
      },
      SECRET,
      { expiresInSeconds: 60 },
    );

    const payload = await verifyAccessToken(token, 'farkli-secret-32-karakterli-xxxxx');
    expect(payload).toBeNull();
  });
});

describe('refresh token', () => {
  it('imzalanır ve doğrulanır', async () => {
    const token = await signRefreshToken(
      {
        sub: '11111111-1111-1111-1111-111111111111',
        sessionId: '33333333-3333-3333-3333-333333333333',
        familyId: '44444444-4444-4444-4444-444444444444',
        identity: 'tenant',
      },
      SECRET,
      3600,
    );

    const payload = await verifyRefreshToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('11111111-1111-1111-1111-111111111111');
    expect(payload?.familyId).toBe('44444444-4444-4444-4444-444444444444');
  });
});