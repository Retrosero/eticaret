/**
 * Auth modülü — JWT, refresh token, brute-force, izin yükleme servislerini
 * DI container'a bağlar.
 *
 * Üç kimlik alanı (super_admin, tenant, customer) bu modülün
 * servislerini kullanır; her biri kendi controller'ında ilgili
 * store'u inject eder.
 */

import { Global, Module } from '@nestjs/common';

import {
  AuthCoreService,
  PgRefreshTokenStore,
  SessionStore,
} from './services/auth-core.service.js';
import { BruteForceService, InMemoryRateCounter } from './services/brute-force.service.js';
import { PermissionLoaderService } from './services/permission-loader.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionsGuard, TenantContextGuard } from './guards/permissions.guard.js';

@Global()
@Module({
  providers: [
    AuthCoreService,
    SessionStore,
    PermissionLoaderService,
    BruteForceService,
    {
      provide: 'SUPER_ADMIN_REFRESH_STORE',
      useFactory: (pool: import('pg').Pool) => new PgRefreshTokenStore(pool, 'super_admin'),
      inject: ['PG_POOL_TOKEN'],
    },
    {
      provide: 'TENANT_USER_REFRESH_STORE',
      useFactory: (pool: import('pg').Pool) => new PgRefreshTokenStore(pool, 'tenant_user'),
      inject: ['PG_POOL_TOKEN'],
    },
    {
      provide: 'CUSTOMER_REFRESH_STORE',
      useFactory: (pool: import('pg').Pool) => new PgRefreshTokenStore(pool, 'customer'),
      inject: ['PG_POOL_TOKEN'],
    },
    {
      provide: 'RATE_COUNTER',
      useClass: InMemoryRateCounter,
    },
    JwtAuthGuard,
    PermissionsGuard,
    TenantContextGuard,
  ],
  exports: [
    AuthCoreService,
    SessionStore,
    PermissionLoaderService,
    BruteForceService,
    'SUPER_ADMIN_REFRESH_STORE',
    'TENANT_USER_REFRESH_STORE',
    'CUSTOMER_REFRESH_STORE',
    JwtAuthGuard,
    PermissionsGuard,
    TenantContextGuard,
  ],
})
export class AuthModule {}