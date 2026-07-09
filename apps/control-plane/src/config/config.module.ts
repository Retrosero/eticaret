/**
 * ConfigRootModule — yalnızca env tipini dışa aktarır.
 *
 * NestJS'de `@nestjs/config` yerine doğrudan Zod şeması kullanıyoruz.
 * Üretimde `.parse` patlarsa uygulama zaten başlamaz.
 */

import { Module, Global } from '@nestjs/common';
import { envSchema, type Env } from './env.schema.js';

// Üretimde env doğrula; geliştirmede de yine doğrula ama hata detayı bas.
if (process.env['NODE_ENV'] === 'production') {
  envSchema.parse(process.env);
} else {
  const r = envSchema.safeParse(process.env);
  if (!r.success) {
    // eslint-disable-next-line no-console
    console.error('[control-plane] env doğrulaması başarısız:', r.error.flatten());
  }
}

@Global()
@Module({
  providers: [
    {
      provide: 'APP_ENV',
      useValue: envSchema.parse(process.env) satisfies Env,
    },
  ],
  exports: ['APP_ENV'],
})
export class ConfigRootModule {}
