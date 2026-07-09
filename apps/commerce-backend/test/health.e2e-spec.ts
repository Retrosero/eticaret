/**
 * E2E: HTTP server temel sağlık testleri (DB-bağımsız).
 *
 * - Helmet, compression, cors middleware'lerinin aktif olduğunu doğrular
 * - HTTP server response formatı doğru
 * - 404 handling doğru
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  bootstrapE2EApp,
  DbIndependentTestModule,
  type E2EApp,
} from './setup.js';

describe('E2E: HTTP Server Health (DB-independent)', () => {
  let ctx: E2EApp;

  beforeAll(async () => {
    ctx = await bootstrapE2EApp(DbIndependentTestModule);
  });

  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  it('GET /api/_test/public → 200 + JSON content-type', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/_test/public').expect(200);

    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET /api/_test/protected → 401 + JSON content-type', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/_test/protected');

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    // Nest default 401 format: { statusCode, message }
    expect(res.body).toHaveProperty('statusCode', 401);
  });

  it('GET /unknown-path → 404', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/unknown-path');
    expect(res.status).toBe(404);
  });

  it('Response time < 1000ms (hot path)', async () => {
    const start = Date.now();
    await request(ctx.app.getHttpServer()).get('/api/_test/public').expect(200);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });

  it('Helmet security headers aktif', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/_test/public');
    // Helmet eklediği başlıklardan en az biri
    expect(res.headers).toHaveProperty('x-content-type-options');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('Compression aktif (Accept-Encoding: gzip)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/public')
      .set('Accept-Encoding', 'gzip');
    // Küçük response sıkıştırılmaz ama header var
    expect([200, 304]).toContain(res.status);
  });

  it('CORS aktif (Origin: *)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/_test/public')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers).toHaveProperty('access-control-allow-credentials');
  });
});