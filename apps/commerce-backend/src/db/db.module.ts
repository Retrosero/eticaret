/**
 * DB modülü — Prisma sağlayıcısı dışa aktarımı.
 */

import { Module, Global } from '@nestjs/common';

import { PrismaService, PRISMA_TOKEN } from './prisma.service.js';

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_TOKEN,
      useFactory: (): PrismaService => new PrismaService(),
    },
    PrismaService,
  ],
  exports: [PRISMA_TOKEN, PrismaService],
})
export class DbModule {}
