/**
 * Prisma istemcisi DI provider'ı.
 *
 * Üretim: tek PrismaClient örneği, modül ömrünce yaşar.
 * Test:    `PrismaService.forTest(prismaMock)` ile sahte istemci bağlanır.
 *
 * Connection URL `process.env.DATABASE_URL`'den okunur. Tenant başına
 * ayrı veritabanı ADR-001 gereği connection string runtime'da değiştirilir.
 */

import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public readonly client: PrismaClient;

  constructor() {
    this.client = new PrismaClient({
      log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  /** Transaction çalıştır. */
  async withTx<T>(work: (client: PrismaClient) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => work(tx as unknown as PrismaClient));
  }

  /** Test için sahte istemci. */
  static forTest(mock: PrismaClient): PrismaService {
    const instance = new PrismaService();
    // Testte onModuleInit/onModuleDestroy çağrılmaz
    (instance as unknown as { client: PrismaClient }).client = mock;
    return instance;
  }
}

/** Modül DI token'ı. */
export const PRISMA_TOKEN = Symbol.for('@eticart/commerce-backend/PRISMA');

/** Tema/CMS tabloları için control-plane veritabanı istemcisi. */
export const CONTROL_PRISMA_TOKEN = Symbol.for('@eticart/commerce-backend/CONTROL_PRISMA');

@Injectable()
export class ControlPrismaService implements OnModuleInit, OnModuleDestroy {
  public readonly client: PrismaClient;

  constructor() {
    this.client = new PrismaClient({
      datasourceUrl: process.env['CONTROL_DATABASE_URL'] ?? process.env['DATABASE_URL'],
      log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> { await this.client.$connect(); }
  async onModuleDestroy(): Promise<void> { await this.client.$disconnect(); }
}
