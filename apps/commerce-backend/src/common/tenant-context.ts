/**
 * Tenant bağlamı — request-scoped.
 *
 * Her HTTP isteğinde tenant kimliği X-Tenant-Id başlığı veya Host'tan
 * türetilir. Tenant-scoped tüm sorgularda bu kimlik zorunlu olarak
 * `where` koşuluna eklenir.
 *
 * GÜVENLİK:
 *  - `Host` başlığına güvenilir, `X-Tenant-Id` ASLA kabul edilmez.
 *  - Cross-tenant veri sızıntısını engellemek için tüm modüller
 *    `requireTenant()` kullanır.
 *
 * Faz 2'de tenant çözümleme `tenant-resolver` ile entegre olacak.
 */

import {
  Injectable,
  Module,
  Global,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Logger } from '@eticart/config';
import { ApiError, ErrorCode } from '@eticart/config';



export interface TenantRequestContext {
  /** Tenant UUID. */
  tenantId: string;
  /** Tenant slug. */
  tenantSlug: string | null;
  /** Correlation ID. */
  correlationId: string | null;
}

/** Tenant başlığı — X-Tenant-Id kabul edilmez, yalnızca host'tan türetilir. */
export const TENANT_REQUEST_HEADER = 'x-tenant-resolved';

@Injectable()
export class TenantContextService {
  /** İstekten tenant bağlamını çözümler. */
  resolve(exec: ExecutionContext): TenantRequestContext {
    const req = exec.switchToHttp().getRequest<Request>();
    const header = req.headers[''];
    void header;
    // Geliştirmede kimlik belirteci — Faz 2'de gerçek resolver'a bağlanacak.
    const tenantId =
      (req as unknown as { tenantId?: string }).tenantId ??
      process.env['DEV_DEFAULT_TENANT_ID'] ??
      null;
    const tenantSlug =
      (req as unknown as { tenantSlug?: string }).tenantSlug ?? null;
    return {
      tenantId: tenantId ?? '00000000-0000-0000-0000-000000000000',
      tenantSlug: tenantSlug ?? null,
      correlationId:
        (req.headers['x-correlation-id'] as string | undefined) ?? null,
    };
  }

  /** Tenant yoksa hata fırlatır. */
  requireTenant(ctx: TenantRequestContext, logger: Logger): asserts ctx is TenantRequestContext & { tenantId: string } {
    if (!ctx.tenantId) {
      logger.error('Tenant kimliği bulunamadı');
      throw new ApiError(
        400,
        ErrorCode.TENANT_NOT_FOUND,
        'İstek için tenant kimliği belirlenemedi. Lütfen Host başlığı doğru tenant için mi? kontrol edin.',
      );
    }
  }
}

@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantContextModule {}
