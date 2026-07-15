/** Request-scoped tenant context. Tenant is set by TenantResolverMiddleware. */
import { Global, Injectable, Module, type ExecutionContext } from '@nestjs/common';
import type { Logger } from '@eticart/config';
import { ApiError, ErrorCode } from '@eticart/config';

import type { RequestWithTenant } from './tenant-resolver.middleware.js';

export interface TenantRequestContext {
  tenantId: string | null;
  tenantSlug: string | null;
  source?: 'subdomain' | 'custom-domain' | 'development';
  host?: string;
  correlationId: string | null;
}

export const TENANT_REQUEST_HEADER = 'x-tenant-resolved';

@Injectable()
export class TenantContextService {
  resolve(exec: ExecutionContext): TenantRequestContext {
    const req = exec.switchToHttp().getRequest<RequestWithTenant>();
    const tenant = req.tenantContext;
    return {
      tenantId: tenant?.tenantId ?? null,
      tenantSlug: tenant?.tenantSlug ?? null,
      source: tenant?.source,
      host: tenant?.host,
      correlationId: (req.headers['x-correlation-id'] as string | undefined) ?? null,
    };
  }

  requireTenant(
    ctx: TenantRequestContext,
    logger: Logger,
  ): asserts ctx is TenantRequestContext & { tenantId: string } {
    if (!ctx.tenantId) {
      logger.error('Tenant kimliği bulunamadı');
      throw new ApiError(
        400,
        ErrorCode.TENANT_NOT_FOUND,
        'İstek için tenant kimliği belirlenemedi.',
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
