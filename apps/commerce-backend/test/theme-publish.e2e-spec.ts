/**
 * Gerçek control DB + HTTP E2E: tema publish ve rollback.
 *
 * Çalıştırma:
 * CONTROL_DATABASE_URL=postgresql://test:test@localhost:55434/eticart_test \
 * DATABASE_URL=postgresql://test:test@localhost:55434/eticart_test \
 * pnpm --filter @eticart/commerce-backend exec vitest run test/theme-publish.e2e-spec.ts
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { bootstrapE2EApp, generateTestJwt, type E2EApp } from './setup.js';

const suite = process.env['CONTROL_DATABASE_URL'] ? describe : describe.skip;

suite('E2E: tenant tema publish ve rollback', () => {
  let ctx: E2EApp;
  let pool: Pool;
  let tenantId: string;
  let token: string;
  let originalAssignmentId: string;
  let draftAssignmentId: string;
  let csrfCookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env['CONTROL_DATABASE_URL'] });
    const tenant = await pool.query<{ id: string }>(
      `SELECT id FROM public.tenants WHERE slug = 'firma-a' LIMIT 1`,
    );
    if (!tenant.rows[0]) throw new Error('E2E tenant firma-a bulunamadı.');
    tenantId = tenant.rows[0].id;

    const active = await pool.query<{ id: string; theme_id: string }>(
      `SELECT id, theme_id FROM public.tenant_theme_assignments
       WHERE tenant_id = $1::uuid AND status = 'active' LIMIT 1`,
      [tenantId],
    );
    if (!active.rows[0]) throw new Error('E2E aktif tema bulunamadı.');
    originalAssignmentId = active.rows[0].id;

    token = await generateTestJwt({
      sub: '22222222-2222-2222-2222-222222222222',
      tenantId,
      role: 'tenant_admin',
      identity: 'tenant',
      sessionId: '44444444-4444-4444-4444-444444444444',
      twoFactorVerified: true,
    });
    ctx = await bootstrapE2EApp(AppModule);

    const csrfResponse = await request(ctx.app.getHttpServer())
      .get('/api/admin/theme/assignments')
      .set('Host', 'firma-a.eticart.com.tr')
      .set('Authorization', `Bearer ${token}`);
    if (csrfResponse.status !== 200) {
      throw new Error(`Tema assignment GET başarısız: ${csrfResponse.status} ${csrfResponse.text}`);
    }
    csrfCookie = csrfResponse.headers['set-cookie']?.[0] ?? '';
    csrfToken = decodeURIComponent(csrfCookie.split(';')[0]?.split('=')[1] ?? '');
    if (!csrfToken) throw new Error('E2E CSRF cookie üretilemedi.');
  });

  afterAll(async () => {
    if (draftAssignmentId) {
      await pool.query(
        `DELETE FROM public.tenant_theme_assignments
         WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'draft'`,
        [draftAssignmentId, tenantId],
      );
    }
    await ctx?.close();
    await pool?.end();
  });

  it('draft oluşturur, publish eder, tenant temasına rollback yapar', async () => {
    const assignments = await request(ctx.app.getHttpServer())
      .get('/api/admin/theme/assignments')
      .set('Host', 'firma-a.eticart.com.tr')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const active = (assignments.body as Array<{ id: string; themeId: string; status: string }>).find((item) => item.status === 'active');
    const targetTheme = active?.themeId === 'modern' ? 'classic' : 'modern';

    const draft = await request(ctx.app.getHttpServer())
      .post('/api/admin/theme/drafts')
      .set('Host', 'firma-a.eticart.com.tr')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', csrfCookie)
      .set('x-csrf-token', csrfToken)
      .send({ themeId: targetTheme, version: '1.0.0' })
      .expect(201);
    draftAssignmentId = draft.body.id as string;
    expect(draft.body).toMatchObject({ themeId: targetTheme, status: 'draft', tenantId });

    await request(ctx.app.getHttpServer())
      .post('/api/admin/theme/preview-token')
      .set('Host', 'firma-a.eticart.com.tr')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', csrfCookie)
      .set('x-csrf-token', csrfToken)
      .send({ assignmentId: draftAssignmentId })
      .expect(200)
      .expect(({ body }) => {
        expect(body.token).toEqual(expect.any(String));
        expect(body.expiresInSeconds).toBe(900);
      });

    await request(ctx.app.getHttpServer())
      .post('/api/admin/theme/publish')
      .set('Host', 'firma-a.eticart.com.tr')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', csrfCookie)
      .set('x-csrf-token', csrfToken)
      .send({ assignmentId: draftAssignmentId })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: draftAssignmentId, status: 'active', themeId: targetTheme });
      });

    await request(ctx.app.getHttpServer())
      .post('/api/admin/theme/rollback')
      .set('Host', 'firma-a.eticart.com.tr')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', csrfCookie)
      .set('x-csrf-token', csrfToken)
      .send({ assignmentId: originalAssignmentId })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: originalAssignmentId, status: 'active' });
      });

    const finalAssignments = await pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM public.tenant_theme_assignments
       WHERE tenant_id = $1::uuid AND id IN ($2::uuid, $3::uuid)`,
      [tenantId, originalAssignmentId, draftAssignmentId],
    );
    expect(finalAssignments.rows.find((row) => row.id === originalAssignmentId)?.status).toBe('active');
    expect(finalAssignments.rows.find((row) => row.id === draftAssignmentId)?.status).toBe('archived');
  });
});
