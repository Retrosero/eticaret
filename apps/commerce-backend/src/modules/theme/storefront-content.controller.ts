import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithTenant } from '../../common/tenant-resolver.middleware.js';
import { ApiError, ErrorCode } from '@eticart/config';
import { StorefrontContentService } from './storefront-content.service.js';

function tenantId(req: Request): string {
  const id = (req as RequestWithTenant).tenantContext?.tenantId;
  if (!id) throw new ApiError(400, ErrorCode.TENANT_NOT_FOUND, 'Tenant çözümlenemedi.');
  return id;
}

function limitValue(value: string | undefined, fallback: number): number {
  return Math.min(20, Math.max(1, Number(value ?? fallback) || fallback));
}

@Controller('api/store')
export class StorefrontContentController {
  constructor(private readonly content: StorefrontContentService) {}

  @Get('banners')
  banners(@Req() req: Request, @Query('placement') placement = 'home-hero') {
    return this.content.banners(tenantId(req), placement);
  }

  @Get('blog/posts')
  blogPosts(@Req() req: Request, @Query('limit') limit?: string) {
    return this.content.blogPosts(tenantId(req), limitValue(limit, 6));
  }

  @Get('testimonials')
  testimonials(@Req() req: Request, @Query('limit') limit?: string) {
    return this.content.testimonials(tenantId(req), limitValue(limit, 6));
  }
}
