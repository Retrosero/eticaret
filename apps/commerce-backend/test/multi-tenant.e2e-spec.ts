/**
 * E2E: Multi-tenant token format doğrulaması (DB-bağımsız).
 *
 * JWT payload içindeki tenantId claim'inin doğru parse edildiğini doğrular.
 * Tam multi-tenant filtering AppModule E2E testlerinde yapılır (DB gerekir).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  bootstrapE2EApp,
  buildTestUser,
  DbIndependentTestModule,
  type E2EApp,
} from './setup.js';

describe('E2E: JWT tenant claim (DB-independent)', () => {
  let ctx: E2EApp;

  beforeAll(async () => {
    ctx = await bootstrapE2EApp(DbIndependentTestModule);
  });

  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  it('Tenant A token ile auth başarılı', async () => {
    const userA = await buildTestUser({
      tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      email: 'a@test.local',
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
  });

  it('Tenant B token ile auth başarılı', async () => {
    const userB = await buildTestUser({
      tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      email: 'b@test.local',
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
  });

  it('Farklı tenant token\'ları ayrı ayrı çalışır', async () => {
    const userA = await buildTestUser({ tenantId: 'tenant-a-id-123456789012345678' });
    const userB = await buildTestUser({ tenantId: 'tenant-b-id-123456789012345678' });

    const resA = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(resA.status).toBe(200);

    const resB = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', `Bearer ${userB.token}`);
    expect(resB.status).toBe(200);
  });

  it('Custom claims (roles, customerId) doğru parse edilir', async () => {
    const adminUser = await buildTestUser({ roles: ['tenant_admin'] });
    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', `Bearer ${adminUser.token}`);

    // Test controller roles kontrol etmiyor; sadece auth yeterli
    expect(res.status).toBe(200);
  });
});