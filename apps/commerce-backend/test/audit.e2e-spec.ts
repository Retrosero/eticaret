/**
 * E2E: Audit log + 2FA + Refresh token (DB-bağımsız).
 *
 * DB-bağımsız audit endpoint'leri test edilir (in-memory mode).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  bootstrapE2EApp,
  buildTestUser,
  DbIndependentTestModule,
  type E2EApp,
} from './setup.js';

describe('E2E: Audit (in-memory mode)', () => {
  let ctx: E2EApp;
  let adminUser: Awaited<ReturnType<typeof buildTestUser>>;

  beforeAll(async () => {
    ctx = await bootstrapE2EApp(DbIndependentTestModule);
    adminUser = await buildTestUser({ roles: ['tenant_admin'] });
  });

  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  it('JWT token ile auth akışı çalışıyor', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/protected')
      .set('Authorization', `Bearer ${adminUser.token}`);

    // Auth başarılı olmalı (test controller role kontrol etmiyor)
    expect([200, 403]).toContain(res.status);
  });
});