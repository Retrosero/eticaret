/**
 * Plugin Marketplace REST Controller (commerce-backend).
 *
 * Tenant'lar marketplace'i görüntüler, plugin install/enable/disable
 * yapar. Super admin yeni plugin yükleyebilir.
 *
 * Endpoint'ler:
 *   GET  /api/marketplace/plugins          → Marketplace listesi
 *   GET  /api/marketplace/plugins/:code    → Plugin detayı
 *   GET  /api/marketplace/installed        → Yüklü plugin'ler
 *   POST /api/marketplace/install          → Plugin yükle
 *   POST /api/marketplace/installed/:code/configure  → Config güncelle
 *   POST /api/marketplace/installed/:code/enable     → Etkinleştir
 *   POST /api/marketplace/installed/:code/disable    → Devre dışı
 *   DELETE /api/marketplace/installed/:code          → Kaldır
 *   POST /api/marketplace/installed/:code/test       → Test bağlantısı
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { Inject } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { LOGGER_TOKEN } from '../../common/logger.js';
import { PluginService } from './plugin.service.js';
import { globalRegistry } from '@eticart/plugin-sdk';

@ApiTags('Plugin Marketplace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('marketplace')
export class PluginController {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    private readonly plugins: PluginService,
  ) {}

  /**
   * Marketplace listesi (tüm plugin'ler).
   */
  @Get('plugins')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marketplace\'teki tüm plugin\'leri listele' })
  async listMarketplace(): Promise<unknown> {
    return this.plugins.listMarketplace();
  }

  /**
   * Plugin detayı.
   */
  @Get('plugins/:code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin detayı' })
  async getPlugin(@Param('code') code: string): Promise<unknown> {
    const plugin = this.plugins.getMarketplacePlugin(code);
    if (!plugin) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Plugin bulunamadı.');
    }
    return plugin;
  }

  /**
   * Yüklü plugin'ler.
   */
  @Get('installed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mevcut tenant için yüklü plugin\'ler' })
  async listInstalled(
    @CurrentUser() user: { tenantId: string },
  ): Promise<unknown> {
    return this.plugins.listInstalled(user.tenantId);
  }

  /**
   * Plugin yükle.
   */
  @Post('install')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Plugin yükle (marketplace\'ten)' })
  async install(
    @CurrentUser() user: { tenantId: string },
    @Body() body: { code: string; config?: Record<string, unknown> },
  ): Promise<unknown> {
    if (!body.code) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Plugin kodu zorunlu.');
    }
    return this.plugins.install(user.tenantId, body.code, body.config ?? {});
  }

  /**
   * Plugin config güncelle.
   */
  @Post('installed/:code/configure')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin konfigürasyonunu güncelle' })
  async configure(
    @CurrentUser() user: { tenantId: string },
    @Param('code') code: string,
    @Body() body: { config: Record<string, unknown> },
  ): Promise<unknown> {
    if (!body.config) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Config zorunlu.');
    }
    return this.plugins.configure(user.tenantId, code, body.config);
  }

  /**
   * Plugin etkinleştir.
   */
  @Post('installed/:code/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin\'i etkinleştir' })
  async enable(
    @CurrentUser() user: { tenantId: string },
    @Param('code') code: string,
  ): Promise<unknown> {
    return this.plugins.enable(user.tenantId, code);
  }

  /**
   * Plugin devre dışı bırak.
   */
  @Post('installed/:code/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin\'i devre dışı bırak' })
  async disable(
    @CurrentUser() user: { tenantId: string },
    @Param('code') code: string,
  ): Promise<unknown> {
    return this.plugins.disable(user.tenantId, code);
  }

  /**
   * Plugin kaldır.
   */
  @Delete('installed/:code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin\'i kaldır' })
  async uninstall(
    @CurrentUser() user: { tenantId: string },
    @Param('code') code: string,
  ): Promise<unknown> {
    return this.plugins.uninstall(user.tenantId, code);
  }

  /**
   * Plugin test bağlantısı.
   */
  @Post('installed/:code/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin bağlantısını test et' })
  async testConnection(
    @CurrentUser() user: { tenantId: string },
    @Param('code') code: string,
  ): Promise<unknown> {
    return this.plugins.testConnection(user.tenantId, code);
  }

  // ─────────────────────────────────────────────────────────────
  // VERSİYON YÖNETİMİ (Faz 23)
  // ─────────────────────────────────────────────────────────────

  /**
   * Plugin'in mevcut versiyonlarını listele.
   */
  @Get('versions/:code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin versiyonlarını listele' })
  listVersions(@Param('code') code: string): unknown {
    return this.plugins.listPluginVersions(code);
  }

  /**
   * Plugin'i belirli versiyona güncelle.
   */
  @Post('installed/:code/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin\'i yeni versiyona güncelle' })
  async updatePlugin(
    @CurrentUser() user: { tenantId: string; sub: string },
    @Param('code') code: string,
    @Body() body: { version: string },
  ): Promise<unknown> {
    return this.plugins.updatePlugin(user.tenantId, code, body.version, user.sub);
  }

  /**
   * Plugin'i önceki versiyona rollback et.
   */
  @Post('installed/:code/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin\'i önceki versiyona geri al' })
  async rollbackPlugin(
    @CurrentUser() user: { tenantId: string; sub: string },
    @Param('code') code: string,
    @Body() body: { version: string },
  ): Promise<unknown> {
    return this.plugins.rollbackPlugin(user.tenantId, code, body.version, user.sub);
  }

  /**
   * Tenant için update history.
   */
  @Get('installed/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin update/rollback geçmişi' })
  getHistory(@CurrentUser() user: { tenantId: string }): unknown {
    return this.plugins.getUpdateHistory(user.tenantId);
  }

  /**
   * Plugin health check.
   */
  @Get('installed/:code/health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plugin sağlık kontrolü' })
  async healthCheck(
    @CurrentUser() user: { tenantId: string },
    @Param('code') code: string,
  ): Promise<unknown> {
    return this.plugins.checkHealth(user.tenantId, code);
  }
}
