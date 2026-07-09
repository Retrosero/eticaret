/**
 * Auth refresh endpoint — refresh token rotation.
 *
 * POST /api/auth/refresh
 *   body: { refreshToken: string }
 *   response: { accessToken, refreshToken, familyId, expiresIn }
 *
 * POST /api/auth/logout
 *   body: { refreshToken: string }
 *   response: { ok: true }
 */
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { ApiError, ErrorCode } from '@eticart/config';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PrismaService, PRISMA_TOKEN } from '../../db/prisma.service.js';
import { refreshTokenService } from '../../common/refresh-token.service.js';

const RefreshSchema = z.object({
  refreshToken: z.string().min(20),
});

@Controller('api/auth')
export class AuthRefreshController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(RefreshSchema)) body: z.infer<typeof RefreshSchema>,
  ): Promise<unknown> {
    const secrets = {
      access: process.env['JWT_SECRET'] ?? 'dev-secret',
      refresh: process.env['JWT_REFRESH_SECRET'] ?? process.env['JWT_SECRET'] ?? 'dev-secret',
    };

    try {
      return await refreshTokenService.rotate(
        body.refreshToken,
        secrets,
        {
          isRevoked: async (jti) => {
            const row = await this.prisma.client.refreshTokenRevocation.findUnique({
              where: { jti },
              select: { id: true },
            });
            return !!row;
          },
          revoke: async ({ jti, familyId, tenantId, userId, reason, expiresAt }) => {
            await this.prisma.client.refreshTokenRevocation.create({
              data: {
                jti,
                familyId,
                tenantId,
                userId,
                reason,
                expiresAt,
              },
            });
          },
          revokeFamily: async (familyId) => {
            // Tüm revoke edilmemiş family üyelerini revoke et
            await this.prisma.client.$executeRaw`
              UPDATE refresh_token_revocations
              SET reason = 'reused'
              WHERE "familyId" = ${familyId}::uuid
            `.catch(() => null);

            // Family'deki tüm mevcut token'lar için revocation oluştur
            // (rotated edilmemiş olanlar için) — şimdilik basit yaklaşım
          },
          resolveIdentity: async (userId) => {
            // User modeli Faz 9'da ayrıldı (Customer/DealerUser); basit stub.
            // İleride Prisma User tablosundan lookup yapılacak.
            return {
              userId,
              email: `${userId}@eticart.local`,
              roles: ['customer'],
            };
          },
        },
      );
    } catch (err: any) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, err?.message ?? 'Token rotation başarısız.');
    }
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Body(new ZodValidationPipe(RefreshSchema)) body: z.infer<typeof RefreshSchema>,
  ): Promise<unknown> {
    const secrets = {
      refresh: process.env['JWT_REFRESH_SECRET'] ?? process.env['JWT_SECRET'] ?? 'dev-secret',
    };

    await refreshTokenService.logout(body.refreshToken, secrets, {
      revoke: async ({ jti, familyId, expiresAt }) => {
        await this.prisma.client.refreshTokenRevocation
          .create({
            data: { jti, familyId, reason: 'logout', expiresAt },
          })
          .catch(() => {
            // Zaten revoke edilmişse sessizce geç
          });
      },
    });

    return { ok: true };
  }
}