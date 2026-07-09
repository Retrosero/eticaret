/**
 * Control-plane smoke testi.
 * Amaç: ana modülün en azından yüklenebildiğini kanıtlamak.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../app.module.js';
import { envSchema } from '../config/env.schema.js';

// Test ortamında zorunlu env değişkenlerini dolduruyoruz
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'silent';
process.env['APP_VERSION'] = '0.0.0-test';
process.env['CONTROL_PLANE_PORT'] = '0';
process.env['CONTROL_PLANE_GLOBAL_PREFIX'] = 'api/v1';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['JWT_SECRET'] = 'test-secret-test-secret-test-secret-test';
process.env['REQUEST_BODY_LIMIT'] = '1mb';

describe('control-plane (smoke)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('envSchema kabul edilebilir bir test env setini parse eder', () => {
    const ok = envSchema.safeParse(process.env);
    expect(ok.success).toBe(true);
  });

  it('GET /api/v1/health liveness döner', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'control-plane' });
  });

  it('GET /api/v1/ready readiness döner', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/ready');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(res.body.checks).toBeDefined();
  });
});
