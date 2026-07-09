/**
 * Plugin Updates Controller.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { PluginUpdatesService } from './plugin-updates.service.js';

const preferenceSchema = z.object({
  pluginCode: z.string().min(1).max(100),
  updateWindow: z.enum(['immediate', 'weekly', 'monthly', 'manual']),
});

@ApiTags('Plugin Updates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugin-updates')
export class PluginUpdatesController {
  constructor(private readonly updates: PluginUpdatesService) {}

  @Get('notifications')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bekleyen plugin update bildirimleri' })
  async list(
    @CurrentUser() user: { tenantId: string },
    @Query('unseen') unseen?: string,
  ): Promise<unknown> {
    return this.updates.listNotifications(user.tenantId, {
      onlyUnseen: unseen === 'true',
    });
  }

  @Patch('notifications/:id/seen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bildirimi görüldü işaretle' })
  async seen(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ): Promise<unknown> {
    return { ok: await this.updates.markSeen(id, user.tenantId) };
  }

  @Patch('notifications/:id/action')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bildirim aksiyonu (skip / schedule)' })
  async action(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
    @Body() body: { action: 'skipped' | 'scheduled' },
  ): Promise<unknown> {
    return { ok: await this.updates.setAction(id, user.tenantId, body.action) };
  }

  @Get('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin update tercihlerini getir' })
  async getPref(
    @CurrentUser() user: { tenantId: string },
    @Query('pluginCode') pluginCode: string,
  ): Promise<unknown> {
    return { updateWindow: await this.updates.getUpdatePreference(user.tenantId, pluginCode) };
  }

  @Post('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin update tercihini ayarla' })
  async setPref(
    @CurrentUser() user: { tenantId: string },
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = preferenceSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, error: 'Geçersiz tercih.' };
    }
    await this.updates.setUpdatePreference(
      user.tenantId,
      parsed.data.pluginCode,
      parsed.data.updateWindow,
    );
    return { ok: true };
  }
}