/**
 * Ana NestJS AppModule — Faz 9.
 *
 * Modül bağımlılıkları:
 *  - DbModule (global)        : Prisma sağlayıcısı
 *  - LoggerModule (global)    : yapılandırılmış logger
 *  - CartModule               : /api/store/cart
 *  - CheckoutModule           : /api/store/checkout
 *  - OrderModule              : /api/admin/orders + /api/store/customer/orders
 *  - InvoiceModule            : /api/admin/invoices + /api/store/customer/invoices
 *  - CustomerPanelModule      : /api/store/customer/{me,addresses,data-export,delete}
 *  - QuoteModule              : /api/b2b/quotes
 *  - CreditLimitModule        : /api/b2b/credit-limits
 *  - ApprovalModule           : /api/admin/approvals
 *
 * Global filtre: GlobalExceptionFilter — standart JSON hata gövdesi.
 * JWT_SECRET DI token'ı ortam değişkeninden okunur.
 */

import { Module, type Provider } from '@nestjs/common';

import { DbModule } from './db/db.module.js';
import { APP_GUARD } from "@nestjs/core";
import { JWT_SECRET_TOKEN } from "./common/auth.tokens.js";
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule, LOGGER_TOKEN } from './common/logger.js';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware.js';

import { CartModule } from './modules/cart/cart.module.js';
import { CheckoutModule } from './modules/checkout/checkout.module.js';
import { OrderModule } from './modules/order/order.module.js';
import { InvoiceModule } from './modules/invoice/invoice.module.js';
import { CustomerPanelModule } from './modules/customer-panel/customer-panel.module.js';
import { QuoteModule } from './modules/b2b-quote/quote.module.js';
import { CreditLimitModule } from './modules/b2b-credit/credit-limit.module.js';
import { ApprovalModule } from './modules/b2b-application/approval.module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { PluginModule } from './modules/plugins/plugin.module.js';
import { BrandingModule } from './modules/branding/branding.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { SupportModule } from './modules/support/support.module.js';
import { MobileModule } from './modules/mobile/mobile.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { KbModule } from './modules/kb/kb.module.js';
import { PluginUpdatesModule } from './modules/plugin-updates/plugin-updates.module.js';
import { Auth2FAModule } from './modules/auth/auth-2fa.module.js';
import { AuthRefreshModule } from './modules/auth/auth-refresh.module.js';

/**
 * JWT secret sağlayıcısı — JwtAuthGuard için DI token'ı doldurur.
 * Ortam değişkeni öncelikli; geliştirmede fallback.
 */
/** Global exception filter provider — APP_FILTER olarak eklenir. */
const globalFilterProvider: Provider = {
  provide: 'APP_FILTER',
  useClass: GlobalExceptionFilter,
  // LoggerModule zaten global olduğu için LOGGER_TOKEN burada otomatik çözümlenir.
};

@Module({
  imports: [
    LoggerModule, // global — LOGGER_TOKEN
    DbModule, // global — PRISMA_TOKEN
    CartModule,
    CheckoutModule,
    OrderModule,
    InvoiceModule,
    CustomerPanelModule,
    QuoteModule,
    CreditLimitModule,
    ApprovalModule,
    HealthModule,
    NotificationModule,
    StorageModule,
    AuditModule,
    PluginModule,
    BrandingModule,
    AnalyticsModule,
    SupportModule,
    MobileModule,
    AiModule,
    KbModule,
    PluginUpdatesModule,
    Auth2FAModule,
    AuthRefreshModule,
    // Rate limiting — global (auth + public endpoint'ler)
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1_000, // 1 saniye
        limit: 10, // 10 req/s
      },
      {
        name: 'medium',
        ttl: 60_000, // 1 dakika
        limit: 100, // 100 req/dk
      },
      {
        name: 'long',
        ttl: 3_600_000, // 1 saat
        limit: 1_000, // 1000 req/saat
      },
    ]),
  ],
  providers: [
    globalFilterProvider,
    // Global rate limit guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global CSRF koruması (double-submit cookie)
    {
      provide: APP_GUARD,
      useFactory: (secret: string) => {
        // ESM dynamic import çakışmasını önle
        const { CsrfGuard } = require('./common/csrf.guard.js');
        return new CsrfGuard({
          secret,
          publicPaths: [
            // Auth endpoint'leri (login, register) CSRF'siz olmalı
            '/api/auth/login',
            '/api/auth/register',
            '/api/auth/refresh',
            // Health & docs
            '/health',
            '/ready',
            '/api/docs',
          ],
          cookieDomain: process.env['COOKIE_DOMAIN'] || undefined,
        });
      },
      inject: [JWT_SECRET_TOKEN],
    } as any,
  ],
})
export class AppModule {
  /** Middleware'ler module_ref üzerinden main.ts'te uygulanır. */
  static readonly correlationMiddleware = CorrelationIdMiddleware;
  /** Token export'ları main.ts ve testler için. */
  static readonly tokens = {
    LOGGER_TOKEN,
  };
}