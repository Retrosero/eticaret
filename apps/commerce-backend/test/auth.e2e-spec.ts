/**
 * E2E: Authentication flow (DB-bağımsız).
 *
 * JwtAuthGuard'ın token doğrulama davranışını test eder.
 * Prisma/Redis gerekmez — JwtAuthGuard ile basit bir test controller yeterli.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  bootstrapE2EApp,
  buildTestUser,
  DbIndependentTestModule,
  type E2EApp,
} from './setup.js';

describe('E2E: Authentication (DB-independent)', () => {
  let ctx: E2EApp;
  let testUser: Awaited<ReturnType<typeof buildTestUser>>;

  beforeAll(async () => {
    ctx = await bootstrapE2EApp(DbIndependentTestModule);
    testUser = await buildTestUser({ roles: ['customer'] });
  });

  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  it('GET /api/_test/public → 200 (token gerekmez)', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/_test/public');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/_test/protected → 401 token yoksa', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/_test/protected');
    expect(res.status).toBe(401);
  });

  it('GET /api/_test/protected → 401 Bearer prefix olmadan', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', testUser.token);
    expect(res.status).toBe(401);
  });

  it('GET /api/_test/protected → 401 geçersiz token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('GET /api/_test/protected → 200 geçerli token ile', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', `Bearer ${testUser.token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/_test/protected → 401 süresi dolmuş token', async () => {
    const { signAccessToken } = await import('@eticart/auth');
    const expiredToken = await signAccessToken(
      {
        sub: testUser.userId,
        email: testUser.email,
        tenantId: testUser.tenantId,
        roles: ['customer'],
        customerId: testUser.customerId,
      },
      process.env['JWT_SECRET'] ?? 'test-jwt-secret-for-e2e-only-min-32-chars-required',
      {
        expiresInSeconds: -1,
        issuer: 'eticart',
      },
    );

    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('GET /api/_test/protected → 401 yanlış issuer', async () => {
    const { signAccessToken } = await import('@eticart/auth');
    const wrongIssuerToken = await signAccessToken(
      {
        sub: testUser.userId,
        email: testUser.email,
        tenantId: testUser.tenantId,
        roles: ['customer'],
        customerId: testUser.customerId,
      },
      process.env['JWT_SECRET'] ?? 'test-jwt-secret-for-e2e-only-min-32-chars-required',
      {
        expiresInSeconds: 3600,
        issuer: 'wrong-issuer',
      },
    );

    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', `Bearer ${wrongIssuerToken}`);
    // Yanlış issuer → 401
    expect(res.status).toBe(401);
  });

  it('GET /api/_test/protected → 401 yanlış secret ile imzalanmış', async () => {
    const { signAccessToken } = await import('@eticart/auth');
    const wrongSecretToken = await signAccessToken(
      {
        sub: testUser.userId,
        email: testUser.email,
        tenantId: testUser.tenantId,
        roles: ['customer'],
        customerId: testUser.customerId,
      },
      'wrong-secret-but-still-32-chars-long-yes',
      {
        expiresInSeconds: 3600,
        issuer: 'eticart',
      },
    );

    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', `Bearer ${wrongSecretToken}`);
    expect(res.status).toBe(401);
  });
});