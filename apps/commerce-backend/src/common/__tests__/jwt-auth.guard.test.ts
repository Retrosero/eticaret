import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { signAccessToken } from '@eticart/auth';

import { JwtAuthGuard } from '../jwt-auth.guard.js';

const SECRET = 'test-jwt-secret-for-tenant-guard-32-chars';

function contextFor(token: string, tenantId: string): ExecutionContext {
  const request = {
    headers: { authorization: `Bearer ${token}` },
    tenantContext: {
      tenantId,
      tenantSlug: tenantId === 'tenant-a' ? 'firma-a' : 'firma-b',
      host: `${tenantId}.eticart.com.tr`,
      source: 'subdomain' as const,
    },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

async function tokenFor(tenantId: string): Promise<string> {
  return signAccessToken(
    {
      sub: 'user-1',
      email: 'user@test.local',
      tenantId,
      roles: ['customer'],
      customerId: 'customer-1',
    },
    SECRET,
    { expiresInSeconds: 3600, issuer: 'eticart' },
  );
}

describe('JwtAuthGuard tenant binding', () => {
  it('token tenantı ile Host tenantı eşleşmezse isteği reddeder', async () => {
    const token = await tokenFor('tenant-a');
    const guard = new JwtAuthGuard(SECRET);

    await expect(guard.canActivate(contextFor(token, 'tenant-b'))).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('eşleşen tenant için tokenı kabul eder', async () => {
    const token = await tokenFor('tenant-a');
    const guard = new JwtAuthGuard(SECRET);

    const ctx = contextFor(token, 'tenant-a');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const request = ctx.switchToHttp().getRequest<{ user?: { tenantId?: string } }>();
    expect(request.user?.tenantId).toBe('tenant-a');
  });
});
