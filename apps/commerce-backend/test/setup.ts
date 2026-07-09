/**
 * E2E test ortamı setup.
 *
 * E2E testler ikiye ayrılır:
 *
 *   1. **DB-bağımsız E2E** (health, guard contract):
 *      AppModule yüklenmeden sadece HealthController + AuthGuard test edilir.
 *      Postgres/Redis bağımlılığı yoktur.
 *
 *   2. **DB-bağımlı E2E** (sipariş, fatura, B2B akışlar):
 *      `DATABASE_URL=postgresql://test:test@localhost:5433/eticart_test` ile
 *      test DB ayakta olmalıdır. CI'da `docker-compose.test.yml` ile başlatılır.
 *
 * Test ortamı env'leri:
 *   - NODE_ENV=test
 *   - JWT_SECRET=test-jwt-secret-for-e2e-only-min-32-chars-required
 *   - SMTP/Resend → noop (env tanımsızsa adapter kayıt edilmez)
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { signAccessToken, type AccessTokenPayload } from '@eticart/auth';
import { JWT_SECRET_TOKEN } from '../src/common/auth.tokens.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-for-e2e-only-min-32-chars-required';
process.env.APP_VERSION = 'test';

export interface E2EApp {
  app: INestApplication;
  module: TestingModule;
  close: () => Promise<void>;
}

/**
 * DB-bağımsız E2E modül.
 *
 * Sadece HealthController ve basit bir controller ile HTTP test yapar.
 * Prisma/Redis gerekmez.
 */
import { Controller, Get } from '@nestjs/common';
import { JwtAuthGuard } from '../src/common/jwt-auth.guard.js';
import { UseGuards } from '@nestjs/common';

@Controller('api/_test')
export class TestController {
  /** Public endpoint. */
  @Get('public')
  public(): { ok: true } {
    return { ok: true };
  }

  /** Protected endpoint (JwtAuthGuard). */
  @Get('protected')
  @UseGuards(JwtAuthGuard)
  protected(): { ok: true; user: string } {
    return { ok: true, user: 'test' };
  }
}

@Module({
  controllers: [TestController],
  providers: [
    {
      provide: JWT_SECRET_TOKEN,
      useFactory: () =>
        process.env['JWT_SECRET'] ?? 'test-jwt-secret-for-e2e-only-min-32-chars-required',
    },
  ],
})
export class DbIndependentTestModule {}

/**
 * NestJS app'i test modunda başlatır.
 *
 * DB-bağımsız testler için `DbIndependentTestModule` veya benzer minimal modül kullanın.
 * Tam AppModule testleri için DB+Redis ayakta olmalı.
 */
export async function bootstrapE2EApp(moduleRef: any): Promise<E2EApp> {
  const testSecret =
    process.env['JWT_SECRET'] ?? 'test-jwt-secret-for-e2e-only-min-32-chars-required';

  const module = await Test.createTestingModule({
    imports: [moduleRef],
  })
    .overrideProvider(JWT_SECRET_TOKEN)
    .useValue(testSecret)
    .compile();

  const app = module.createNestApplication({
    bufferLogs: false,
    logger: ['error', 'warn'],
  });

  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );

  await app.init();

  return {
    app,
    module,
    close: async () => {
      try {
        await app.close();
      } catch {}
      try {
        await module.close();
      } catch {}
    },
  };
}

/**
 * Test için sahte kullanıcı + tenant bilgisi.
 */
export interface TestUser {
  tenantId: string;
  userId: string;
  customerId: string;
  email: string;
  password: string;
  token: string;
  roles: string[];
}

const testSecret = process.env['JWT_SECRET'] ?? 'test-jwt-secret-for-e2e-only-min-32-chars-required';

export async function generateTestJwt(
  payload: Omit<AccessTokenPayload, 'iat' | 'exp' | 'iss'>,
): Promise<string> {
  return signAccessToken(payload, testSecret, {
    expiresInSeconds: 3600,
    issuer: 'eticart',
  });
}

export async function buildTestUser(opts?: {
  tenantId?: string;
  userId?: string;
  customerId?: string;
  email?: string;
  roles?: string[];
}): Promise<TestUser> {
  const tenantId = opts?.tenantId ?? '11111111-1111-1111-1111-111111111111';
  const userId = opts?.userId ?? '22222222-2222-2222-2222-222222222222';
  const customerId = opts?.customerId ?? '33333333-3333-3333-3333-333333333333';
  const email = opts?.email ?? `e2e-${Date.now()}@test.local`;
  const roles = opts?.roles ?? ['customer'];

  const token = await generateTestJwt({
    sub: userId,
    email,
    tenantId,
    roles,
    customerId,
  });

  return { tenantId, userId, customerId, email, password: 'test-password', token, roles };
}