/**
 * Medusa yapılandırması (Faz 1 iskeleti).
 *
 * Bu yapılandırma:
 *  - Postgres'u (pg) bağımlılık olarak tanımlar
 *  - Redis'i cache olarak ekler
 *  - CORS allowlist'i ortamdan okur
 *
 * Faz 2'de:
 *  - Tenant resolver Middleware burada tanıtılacak
 *  - Her tenant başına ayrı veri havuzu (schema-based) açılacak
 */

import { defineConfig, loadEnv } from '@medusajs/framework/utils';

loadEnv(process.env.NODE_ENV!, process.env.MEDUSA_ROOT as string | undefined);

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL!,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET!,
      cookieSecret: process.env.COOKIE_SECRET!,
    },
  },
  modules: {
    // Faz 2'de: tenant başına cache anahtarlama için Redis cache modülü
    // cacheService: {
    //   resolve: () => '@medusajs/cache-redis',
    //   options: { redisUrl: process.env.REDIS_URL! },
    // },
  },
});
