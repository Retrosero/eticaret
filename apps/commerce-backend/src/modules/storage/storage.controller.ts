/**
 * Storage REST controller.
 *
 * Endpoint'ler:
 *  - POST  /api/admin/storage/upload-url    → tenant_admin presigned PUT URL alır
 *  - POST  /api/admin/storage/download-url  → presigned GET URL alır
 *  - DELETE /api/admin/storage/:key         → nesne siler
 *  - GET    /api/admin/storage/health       → driver bilgisi
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../../common/roles.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { uuidSchema } from '@eticart/validation';
import { StorageService } from './storage-service.js';

const CreateUploadUrlSchema = z.object({
  logicalPath: z.string().min(1).max(512).regex(/^[a-zA-Z0-9_\-\/]+$/),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  maxBytes: z.number().int().positive().max(100_000_000).optional(),
});

const CreateDownloadUrlSchema = z.object({
  key: z.string().min(1).max(1024),
  ttlSeconds: z.number().int().positive().max(86_400).optional(),
  downloadFilename: z.string().max(255).optional(),
  disposition: z.enum(['inline', 'attachment']).optional(),
});

const DeleteObjectSchema = z.object({
  tenantId: uuidSchema,
});

@Controller('api/admin/storage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tenant_admin')
export class StorageController {
  /**
   * Tenant için presigned PUT URL üretir.
   *
   * Frontend bu URL'e doğrudan dosya yükler.
   */
  @Post('upload-url')
  @HttpCode(200)
  async createUploadUrl(
    @Body(new ZodValidationPipe(CreateUploadUrlSchema))
    body: z.infer<typeof CreateUploadUrlSchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    return StorageService.createUploadUrl({
      tenantId,
      logicalPath: body.logicalPath,
      filename: body.filename,
      contentType: body.contentType,
      maxBytes: body.maxBytes,
    });
  }

  /**
   * Nesne için presigned GET URL üretir.
   */
  @Post('download-url')
  @HttpCode(200)
  async createDownloadUrl(
    @Body(new ZodValidationPipe(CreateDownloadUrlSchema))
    body: z.infer<typeof CreateDownloadUrlSchema>,
  ): Promise<unknown> {
    return StorageService.createDownloadUrl({
      key: body.key,
      ttlSeconds: body.ttlSeconds,
      downloadFilename: body.downloadFilename,
      disposition: body.disposition,
    });
  }

  /**
   * Nesneyi siler. Tenant boundary doğrulanır.
   */
  @Delete(':key(*)')
  @HttpCode(200)
  async remove(
    @Param() params: { key: string },
    @Body(new ZodValidationPipe(DeleteObjectSchema)) body: z.infer<typeof DeleteObjectSchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    if (tenantId !== body.tenantId) {
      throw new ApiError(403, ErrorCode.FORBIDDEN, 'Tenant uyuşmazlığı.');
    }
    await StorageService.remove(params.key, tenantId);
    return { ok: true };
  }

  /**
   * Storage driver bilgisi (health/debug).
   */
  @Get('health')
  async health(): Promise<unknown> {
    return {
      driver: StorageService.driverKind(),
      driverName: StorageService.driver().name,
    };
  }

  private resolveTenant(req: AuthenticatedRequest): string {
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) {
      throw new ApiError(
        400,
        ErrorCode.TENANT_NOT_FOUND,
        'Tenant kimliği token içinde bulunamadı.',
      );
    }
    return tenantId;
  }
}