/**
 * @eticart/control-plane — uygulama girişi.
 *
 * - Helmet (güvenli HTTP başlıkları)
 * - CORS allowlist (env'den)
 * - Compression
 * - Global validation pipe (Zod)
 * - Rate-limit (NestJS Throttler)
 * - OpenAPI / Swagger
 * - Global API prefix
 */

import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';

import { AppModule } from './app.module.js';
import { envSchema } from './config/env.schema.js';
import { createLogger } from '@eticart/config';
import { parseCorsOrigins, isOriginAllowed } from '@eticart/config';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware.js';

async function bootstrap(): Promise<void> {
  // Üretimde hata varsa uygulama başlamaz
  const env = envSchema.parse(process.env);

  const logger = createLogger({
    service: 'control-plane',
    version: env.APP_VERSION,
    level: env.LOG_LEVEL,
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Güvenlik başlıkları
  app.use(helmet());

  // CORS — env'den allowlist
  const origins = parseCorsOrigins(env.CONTROL_PLANE_CORS);
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        return cb(
          isOriginAllowed(origin, origins) ? null : new Error('CORS engellendi'),
          isOriginAllowed(origin, origins),
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Correlation-Id'],
    }),
  );

  // Sıkıştırma
  app.use(compression());

  // Korelasyon kimliği
  app.use(new CorrelationIdMiddleware().use);

  // Global prefix
  app.setGlobalPrefix(env.CONTROL_PLANE_GLOBAL_PREFIX);

  // Global validation — class-validator kullanmıyoruz (Zod).
  // Burada stub bırakıyoruz; controller'lar kendi Zod şemalarını kullanıyor.
  app.useGlobalPipes(
    new ValidationPipe({ transform: false, whitelist: false, forbidNonWhitelisted: false }),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  // Swagger / OpenAPI
  if (env.API_DOCS_ENABLED === 'true' || env.API_DOCS_ENABLED === '1') {
    setupOpenApi(app, env.API_DOCS_PATH);
  }

  // Body limit
  app.useBodyParser('json', { limit: env.REQUEST_BODY_LIMIT });

  await app.listen(env.CONTROL_PLANE_PORT);

  logger.info(
    {
      port: env.CONTROL_PLANE_PORT,
      env: env.NODE_ENV,
    },
    'Control-plane hazır',
  );
}

function setupOpenApi(app: INestApplication, path: string): void {
  const config = new DocumentBuilder()
    .setTitle('EtiCart Control Plane API')
    .setDescription('Türkçe e-ticaret SaaS kontrol düzlemi API dokümantasyonu')
    .setVersion(process.env['APP_VERSION'] ?? '0.1.0')
    .addApiKey({ type: 'apiKey', name: 'Authorization', in: 'header' }, 'bearer')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(path, app, document);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Control-plane başlatılamadı:', err);
  process.exit(1);
});

// Logger'ı başka modüllerde de kullanabilmek için dışa aktarıyoruz (named export).
export { createLogger } from '@eticart/config';
