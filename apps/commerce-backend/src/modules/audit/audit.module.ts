/**
 * Audit modülü — DB-backed audit log yönetimi.
 *
 * NestJS lifecycle: onModuleInit'te Prisma client'ı alıp
 * auditService.setDbWriter() ile bağlar. AUDIT_DB_ENABLED env
 * false ise sadece in-memory buffer çalışır.
 */
import { Module, Inject, OnModuleInit } from '@nestjs/common';
import { PrismaService, PRISMA_TOKEN } from '../../db/prisma.service.js';
import { auditService } from '../../common/audit.service.js';
import { AuditController } from './audit.controller.js';

@Module({
  controllers: [AuditController],
})
export class AuditModule implements OnModuleInit {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env['AUDIT_DB_ENABLED'] !== 'true') {
      // In-memory mode
      return;
    }

    // DB writer'ı bağla
    auditService.setDbWriter(async (event) => {
      await this.prisma.client.auditLog.create({
        data: {
          id: event.id,
          tenantId: event.tenantId ?? undefined,
          userId: event.userId ?? undefined,
          customerId: event.customerId ?? undefined,
          action: event.action,
          severity: event.severity,
          ip: event.ip,
          userAgent: event.userAgent,
          correlationId: event.correlationId,
          path: event.path,
          method: event.method,
          context: event.context as any,
          occurredAt: event.occurredAt ?? new Date(),
        },
      });
    });
  }
}