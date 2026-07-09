/**
 * AI Controller — REST endpoints.
 *
 *   POST /api/ai/tickets/:id/generate-reply    → Yanıt taslağı üret
 *   POST /api/ai/tickets/:id/approve-reply     → AI taslağını onayla
 *   POST /api/ai/tickets/:id/categorize        → Otomatik kategorize et
 *   POST /api/ai/products/:id/description     → Ürün açıklaması üret
 *   POST /api/ai/products/:id/tags             → Tag önerisi
 *   POST /api/ai/sentiment                     → Duygu analizi
 *   GET  /api/ai/usage                         → Kullanım istatistikleri
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';

import { JwtAuthGuard } from '../../common/jwt-auth.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { AiBackendService } from './ai.service.js';

const sentimentSchema = z.object({
  text: z.string().min(5).max(5000),
});

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiBackendService) {}

  // ─── TICKET AI ───

  @Post('tickets/:id/generate-reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ticket için AI yanıt taslağı üret' })
  async generateTicketReply(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.ai.generateTicketReply(user.tenantId, id);
  }

  @Post('tickets/:id/approve-reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI yanıt taslağını onayla' })
  async approveReply(
    @CurrentUser() user: { tenantId: string; sub: string },
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.ai.approveAiReply(user.tenantId, id, user.sub);
  }

  @Post('tickets/:id/categorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ticket otomatik kategorize et' })
  async categorize(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.ai.categorizeTicket(user.tenantId, id);
  }

  // ─── PRODUCT AI ───

  @Post('products/:id/description')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ürün açıklaması üret' })
  async generateDescription(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.ai.generateProductDescription(user.tenantId, id);
  }

  @Post('products/:id/tags')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ürün tag önerisi' })
  async suggestTags(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.ai.suggestProductTags(user.tenantId, id);
  }

  // ─── SENTIMENT ───

  @Post('sentiment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Metin duygu analizi' })
  async sentiment(
    @CurrentUser() _user: { tenantId: string },
    @Body() body: unknown,
  ): Promise<unknown> {
    const parsed = sentimentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, ErrorCode.VALIDATION_ERROR, 'Geçersiz metin.');
    }
    return this.ai.analyzeSentiment('tenant-1', parsed.data.text);
  }

  // ─── USAGE ───

  @Get('usage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI kullanım istatistikleri' })
  usage(@CurrentUser() user: { tenantId: string }): unknown {
    return this.ai.getUsage(user.tenantId);
  }
}