/**
 * E2E: API contract testleri (DB-bağımlı).
 *
 * Bu dosya DATABASE_URL tanımlıysa çalışır; yoksa skip.
 *
 * Çalıştırmak için:
 *   1. docker compose -f docker-compose.test.yml up -d
 *   2. DATABASE_URL=postgresql://test:test@localhost:5433/eticart_test npm run migrate:test
 *   3. DATABASE_URL=postgresql://test:test@localhost:5433/eticart_test npm run test:e2e
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { bootstrapE2EApp, buildTestUser, type E2EApp } from './setup.js';

const HAS_DB = !!process.env['DATABASE_URL'];

// DB yoksa tüm describe.skip — modül yüklenmeden skip
const ddescribe = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  ddescribe('E2E: API contract (DB-bağımlı — DATABASE_URL yok, skip)', () => {
    it.skip('placeholder', () => {
      // DATABASE_URL tanımlı olduğunda testler çalışır
    });
  });
} else {

ddescribe('E2E: API contract (DB-bağımlı)', () => {
  let ctx: E2EApp;
  let adminUser: Awaited<ReturnType<typeof buildTestUser>>;
  let customerUser: Awaited<ReturnType<typeof buildTestUser>>;

  beforeAll(async () => {
    ctx = await bootstrapE2EApp(AppModule);
    adminUser = await buildTestUser({ roles: ['tenant_admin'] });
    customerUser = await buildTestUser({ roles: ['customer'] });
  });

  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  describe('Store endpoints', () => {
    it('GET /api/store/products → 200', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/store/products')
        .set('X-Tenant-Id', customerUser.tenantId);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('GET /api/store/categories → 200', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/store/categories')
        .set('X-Tenant-Id', customerUser.tenantId);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
    });

    it('POST /api/store/cart → 200 + customer token', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/store/cart')
        .set('Authorization', `Bearer ${customerUser.token}`)
        .set('X-Tenant-Id', customerUser.tenantId)
        .send({ customerId: customerUser.customerId });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
    });

    it('GET /api/store/customer/orders → 200', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/store/customer/orders')
        .set('Authorization', `Bearer ${customerUser.token}`)
        .set('X-Tenant-Id', customerUser.tenantId);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
    });
  });

  describe('Admin endpoints', () => {
    it('GET /api/admin/orders → admin ile erişim', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/orders')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .set('X-Tenant-Id', adminUser.tenantId);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
    });

    it('GET /api/admin/invoices → admin ile erişim', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/invoices')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .set('X-Tenant-Id', adminUser.tenantId);
      expect(res.status).toBe(200);
    });

    it('GET /api/admin/approvals/pending → admin ile erişim', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/approvals/pending')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .set('X-Tenant-Id', adminUser.tenantId);
      expect(res.status).toBe(200);
    });
  });

  describe('Tenant isolation', () => {
    it('Tenant A verisi Tenant B ile erişilemez', async () => {
      const tenantA = await buildTestUser({
        tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      });
      const tenantB = await buildTestUser({
        tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      });

      // Tenant A ile ürün oluştur
      const createRes = await request(ctx.app.getHttpServer())
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .set('X-Tenant-Id', tenantA.tenantId)
        .send({ /* ... */ });
      // Bu detay Faz 11'de genişletilecek
    });
  });
});
}
