import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiError, ErrorCode } from '@eticart/config';
import { z } from 'zod';
import { createThemePreviewToken } from '@eticart/theme-engine';
import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { Roles, RolesGuard } from '../../common/roles.decorator.js';
import { ThemeService } from './theme.service.js';
import { Audit } from '../../common/audit.service.js';

const draftSchema = z.object({
  themeId: z.string().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  overrides: z.record(z.union([z.string().max(500), z.number()])).optional(),
});

const publishSchema = z.object({ assignmentId: z.string().uuid() });
const rollbackSchema = z.object({ assignmentId: z.string().uuid() });

@Controller('api/admin/theme')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tenant_admin')
export class ThemeController {
  constructor(@Inject(ThemeService) private readonly themes: ThemeService) {}

  @Get('assignments')
  list(@CurrentUser() user: { tenantId: string }) {
    return this.themes.listAssignments(user.tenantId);
  }

  @Post('drafts')
  @HttpCode(201)
  createDraft(
    @CurrentUser() user: { tenantId: string; sub?: string },
    @Body() body: unknown,
  ) {
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz tema draft verisi.', {
        details: parsed.error.flatten(),
      });
    }
    return this.themes.createDraft(user.tenantId, {
      themeId: parsed.data.themeId as string,
      version: parsed.data.version as string,
      overrides: parsed.data.overrides,
    });
  }

  @Post('publish')
  @HttpCode(200)
  async publish(
    @CurrentUser() user: { tenantId: string; sub?: string },
    @Body() body: unknown,
  ) {
    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'assignmentId geçersiz.');
    }
    const result = await this.themes.publishDraft(user.tenantId, parsed.data.assignmentId);
    Audit.record({ action: 'theme.publish', severity: 'info', tenantId: user.tenantId, userId: user.sub, context: { assignmentId: result.id, themeId: result.themeId } });
    return result;
  }

  @Post('rollback')
  @HttpCode(200)
  async rollback(
    @CurrentUser() user: { tenantId: string; sub?: string },
    @Body() body: unknown,
  ) {
    const parsed = rollbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'assignmentId geçersiz.');
    }
    const result = await this.themes.rollback(user.tenantId, parsed.data.assignmentId);
    Audit.record({ action: 'theme.rollback', severity: 'warning', tenantId: user.tenantId, userId: user.sub, context: { assignmentId: result.id, themeId: result.themeId } });
    return result;
  }

  @Post('preview-token')
  @HttpCode(200)
  async previewToken(
    @CurrentUser() user: { tenantId: string; sub?: string },
    @Body() body: unknown,
  ) {
    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'assignmentId geçersiz.');
    }
    const assignment = (await this.themes.listAssignments(user.tenantId))
      .find((item) => item.id === parsed.data.assignmentId && item.status === 'draft');
    if (!assignment) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Preview için draft tema bulunamadı.');
    }
    const secret = process.env['THEME_PREVIEW_SECRET'] ?? process.env['JWT_SECRET'];
    if (!secret) {
      throw new ApiError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Tema preview secret yapılandırılmamış.');
    }
    const token = createThemePreviewToken({
      tenantId: user.tenantId,
      assignmentId: assignment.id,
      expiresInSeconds: 900,
    }, secret);
    Audit.record({ action: 'theme.preview', severity: 'info', tenantId: user.tenantId, userId: user.sub, context: { assignmentId: assignment.id, themeId: assignment.themeId, expiresInSeconds: 900 } });
    return {
      token,
      expiresInSeconds: 900,
    };
  }
}
