import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithTenant } from '../../common/tenant-resolver.middleware.js';
import { ApiError, ErrorCode } from '@eticart/config';
import { StorefrontProductsService } from './storefront-products.service.js';

function tenantId(req: Request): string {
  const id = (req as RequestWithTenant).tenantContext?.tenantId;
  if (!id) throw new ApiError(400, ErrorCode.TENANT_NOT_FOUND, 'Tenant çözümlenemedi.');
  return id;
}

@Controller('api/store/products')
export class StorefrontProductsController {
  constructor(private readonly products: StorefrontProductsService) {}

  @Get()
  list(@Req() req: Request, @Query() query: Record<string, string | undefined>) {
    return this.products.list(tenantId(req), query);
  }

  @Get(':slug')
  async detail(@Req() req: Request, @Param('slug') slug: string) {
    const product = await this.products.detail(tenantId(req), slug);
    if (!product) throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ürün bulunamadı.');
    return product;
  }
}
