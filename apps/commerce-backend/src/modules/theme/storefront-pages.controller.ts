import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithTenant } from '../../common/tenant-resolver.middleware.js';
import { ApiError, ErrorCode } from '@eticart/config';
import { StorefrontPagesService } from './storefront-pages.service.js';

function tenantId(req: Request): string {
  const context = (req as RequestWithTenant).tenantContext;
  if (!context?.tenantId) {
    throw new ApiError(400, ErrorCode.TENANT_NOT_FOUND, 'Tenant çözümlenemedi.');
  }
  return context.tenantId;
}

@Controller('api/store/pages')
export class StorefrontPagesController {
  constructor(private readonly pages: StorefrontPagesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.pages.listPages(tenantId(req));
  }

  @Get(':slug')
  async get(@Req() req: Request, @Param('slug') slug: string) {
    const page = await this.pages.getPage(tenantId(req), slug);
    if (!page) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Yayınlanmış sayfa bulunamadı.');
    }
    return page;
  }
}
