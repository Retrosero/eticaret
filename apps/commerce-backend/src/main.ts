/**
 * @eticart/commerce-backend — Faz 9 ana girişi (NestJS).
 *
 * Faz 1-8 arası minimal HTTP placeholder (`/health`, `/ready`) bu dosyada
 * korunur. Faz 9 itibariyle **NestJS AppModule** varsayılan bootstrap
 * yöntemidir. Eski placeholder yalnızca `USE_LEGACY_PLACEHOLDER=1` ortam
 * değişkeni set edilirse aktifleşir (örn. Medusa köprüsü Faz 10'da).
 *
 * Çalıştırma:
 *   pnpm dev       → `nest start --watch`
 *   node dist/main.js → prod
 */

import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';

import { AppModule } from './app.module.js';

const VERSION = process.env['APP_VERSION'] ?? '0.9.0';
const PORT = Number(process.env['PORT'] ?? 9000);

async function bootstrapNest(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    logger: ['error', 'warn', 'log'],
  });

  // Güvenlik + performans middleware'leri (sırası önemli)
  // 1) Helmet — security headers (CSP, HSTS, frame-options, vb.)
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Next.js inline style gerekebilir
          imgSrc: ["'self'", 'data:', 'blob:', 'https://media.eticart.com.tr'],
          // R2/S3/MinIO public URL prefix'leri
          mediaSrc: ["'self'", 'https://media.eticart.com.tr'],
          connectSrc: ["'self'", 'https://api.eticart.com.tr'],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"], // clickjacking koruması
          formAction: ["'self'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests:
            process.env['NODE_ENV'] === 'production' ? [] : null,
        },
      },
      hsts: {
        maxAge: 31_536_000, // 1 yıl
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false, // Next.js ile çakışıyor
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // CDN için
      hidePoweredBy: true,
      noSniff: true,
      xssFilter: true,
    }),
  );

  // 2) HTTP Parameter Pollution koruması
  // (array parametrelerini tek değere indirger; query string ?tag=a&tag=b → ?tag=a)
  app.use((req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => {
    if (req.query) {
      for (const key of Object.keys(req.query)) {
        const v = req.query[key];
        if (Array.isArray(v)) {
          (req.query as Record<string, unknown>)[key] = v[0];
        }
      }
    }
    next();
  });

  // 3) Compression
  app.use(compression());

  // 4) CORS
  const corsOrigins = process.env['CORS_ORIGIN']
    ? process.env['CORS_ORIGIN'].split(',').map((s) => s.trim())
    : true;
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-CSRF-Token', 'X-Correlation-Id'],
      exposedHeaders: ['X-Correlation-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
      maxAge: 3600,
    }),
  );

  // Gövde doğrulama pipe'ı (class-validator yok; Zod pipe controller'larda)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false, // Zod schema controller'larda çalışıyor
      transform: true,
    }),
  );

  // Correlation-Id middleware (tüm isteklerde X-Correlation-Id başlığı)
  // (Nest'in MiddlewareConsumer'ı burada set edilebilir; Faz 9'da yalnızca
  // appModule'a bağımlı olduğu için express middleware olarak eklendi.)
  const { CorrelationIdMiddleware } = await import('./common/correlation-id.middleware.js');
  app.use(new CorrelationIdMiddleware().use);

  // Swagger / OpenAPI (Faz 9)
  const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
  const swaggerConfig = new DocumentBuilder()
    .setTitle('EtiCart Commerce API')
    .setDescription('Türkçe e-ticaret SaaS — Çok kiracılı REST API')
    .setVersion('0.9.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addApiKey({ type: 'apiKey', name: 'X-Tenant-Id', in: 'header' }, 'tenant')
    .addTag('cart', 'Sepet yönetimi')
    .addTag('checkout', 'Ödeme ve checkout')
    .addTag('order', 'Sipariş yönetimi')
    .addTag('invoice', 'Fatura yönetimi')
    .addTag('customer-panel', 'Müşteri paneli')
    .addTag('b2b-quote', 'B2B bayi teklifleri')
    .addTag('b2b-credit-limit', 'B2B kredi limitleri')
    .addTag('b2b-approval', 'B2B onay iş akışları')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[commerce-backend] NestJS ready: http://localhost:${PORT} (v${VERSION})`);
    // eslint-disable-next-line no-console
    console.log(`[commerce-backend] Swagger UI: http://localhost:${PORT}/api/docs`);
  });
}

// ---------------------------------------------------------------------------
// Legacy placeholder (Faz 1-8 uyumluluğu)
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { Readable } from 'node:stream';

function sendJson(
  res: import('node:http').ServerResponse,
  status: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf-8'),
  });
  Readable.from([body]).pipe(res);
}

function bootstrapLegacy(): void {
  const server = createServer((req, res) => {
    if (!req.url) {
      sendJson(res, 400, { success: false, error: { code: 'BAD_REQUEST', message: 'URL yok.' } });
      return;
    }
    if (req.url === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'commerce-backend',
        version: VERSION,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (req.url === '/ready') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'commerce-backend',
        version: VERSION,
        timestamp: new Date().toISOString(),
        checks: {
          postgres: process.env['DATABASE_URL'] ? 'ok' : 'down',
          redis: process.env['REDIS_URL'] ? 'ok' : 'down',
        },
      });
      return;
    }
    sendJson(res, 404, {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint bulunamadı.' },
    });
  });
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[commerce-backend] legacy placeholder: http://localhost:${PORT}`);
  });
}

if (process.env['USE_LEGACY_PLACEHOLDER'] === '1') {
  bootstrapLegacy();
} else {
  bootstrapNest().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[commerce-backend] NestJS bootstrap hatası:', err);
    process.exit(1);
  });
}