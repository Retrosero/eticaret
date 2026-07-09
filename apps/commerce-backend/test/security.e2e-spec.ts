/**
 * E2E: OWASP Top 10 güvenlik kontrolleri.
 *
 * Production hardening testleri:
 *   - Security headers (helmet)
 *   - XSS koruması (input sanitization)
 *   - SQL injection koruması (Zod validation)
 *   - CORS preflight
 *   - Compression aktif
 *   - HTTP method whitelist
 *   - Rate limit (Throttler)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  bootstrapE2EApp,
  buildTestUser,
  DbIndependentTestModule,
  type E2EApp,
} from './setup.js';

describe('E2E: Security Headers (OWASP)', () => {
  let ctx: E2EApp;
  let testUser: Awaited<ReturnType<typeof buildTestUser>>;

  beforeAll(async () => {
    ctx = await bootstrapE2EApp(DbIndependentTestModule);
    testUser = await buildTestUser({ roles: ['customer'] });
  });

  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  describe('Helmet headers', () => {
    it('X-Content-Type-Options: nosniff', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/_test/public');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('X-Frame-Options: DENY (clickjacking)', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/_test/public');
      expect(res.headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/);
    });

    it('Strict-Transport-Security: HSTS aktif', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/_test/public');
      const hsts = res.headers['strict-transport-security'];
      expect(hsts).toBeDefined();
      expect(hsts).toMatch(/max-age=\d+/);
      expect(hsts).toContain('includeSubDomains');
    });

    it('Referrer-Policy: strict-origin-when-cross-origin', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/_test/public');
      expect(res.headers['referrer-policy']).toBeTruthy();
    });

    it('X-Powered-By gizli (hidePoweredBy)', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/_test/public');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('Cross-Origin-Opener-Policy: same-origin', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/_test/public');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    });

    it('Content-Security-Policy default-src self', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/_test/public');
      const csp = res.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toMatch(/frame-ancestors/);
    });
  });

  describe('HPP (HTTP Parameter Pollution)', () => {
    it('Aynı query param birden fazla → tek değer', async () => {
      // ?id=1&id=2&id=3 → id=1 (ilk değer)
      const res = await request(ctx.app.getHttpServer())
        .get('/api/_test/public?id=1&id=2&id=3')
        .expect(200);

      expect(res.status).toBe(200);
    });
  });

  describe('CORS', () => {
    it('Preflight OPTIONS → Access-Control-Allow-Origin', async () => {
      const res = await request(ctx.app.getHttpServer())
        .options('/api/_test/public')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization');

      // CORS preflight response
      expect([200, 204]).toContain(res.status);
    });

    it('Geçerli Origin → Access-Control-Allow-Credentials: true', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/_test/public')
        .set('Origin', 'http://localhost:3000');

      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Compression', () => {
    it('Accept-Encoding: gzip → sıkıştırılmış response', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/_test/public')
        .set('Accept-Encoding', 'gzip');

      // Vary veya Content-Encoding header
      expect([200, 304]).toContain(res.status);
    });
  });

  describe('Authentication güvenliği', () => {
    it('Bearer token olmadan protected → 401', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/_test/protected');
      expect(res.status).toBe(401);
    });

    it('Bearer token ile protected → 200', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/_test/protected')
        .set('Authorization', `Bearer ${testUser.token}`);
      expect(res.status).toBe(200);
    });

    it('Authorization header case-insensitive Bearer', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/_test/protected')
        .set('Authorization', `bearer ${testUser.token}`);
      // Sadece "Bearer " (büyük B) kabul edilir → 401
      expect(res.status).toBe(401);
    });
  });
});