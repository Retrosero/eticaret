import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithTenant } from '../../common/tenant-resolver.middleware.js';
import { ApiError, ErrorCode } from '@eticart/config';
import { StorefrontTaxonomyService } from './storefront-taxonomy.service.js';

function tenantId(req: Request): string {
  const id = (req as RequestWithTenant).tenantContext?.tenantId;
  if (!id) throw new ApiError(400, ErrorCode.TENANT_NOT_FOUND, 'Tenant çözümlenemedi.');
  return id;
}

@Controller('api/store')
export class StorefrontTaxonomyController {
  constructor(private readonly taxonomy: StorefrontTaxonomyService) {}

  @Get('categories')
  categories(@Req() req: Request) {
    return this.taxonomy.categories(tenantId(req));
  }

  @Get('categories/:slug')
  async category(@Req() req: Request, @Param('slug') slug: string) {
    const result = await this.taxonomy.categoryBySlug(tenantId(req), slug);
    if (!result) throw new ApiError(404, ErrorCode.NOT_FOUND, 'Kategori bulunamadı.');
    return result;
  }

  @Get('brands')
  brands(@Req() req: Request) {
    return this.taxonomy.brands(tenantId(req));
  }
}
