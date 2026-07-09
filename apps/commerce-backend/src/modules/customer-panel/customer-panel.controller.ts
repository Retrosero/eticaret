/**
 * Müşteri Paneli Controller — REST API.
 *
 * Endpoint'ler (Faz 9):
 *  - GET    /api/store/customer/me           → profil özeti
 *  - GET    /api/store/customer/addresses     → adres defteri
 *  - POST   /api/store/customer/addresses     → yeni adres
 *  - POST   /api/store/customer/data-export   → KVKK veri ihraç talebi
 *  - POST   /api/store/customer/delete        → KVKK hesap silme talebi
 *
 * Tüm endpoint'ler JWT ile korunur; müşteri sadece kendi verilerine erişir.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiError, ErrorCode } from '@eticart/config';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PrismaService, PRISMA_TOKEN } from '../../db/prisma.service.js';

import {
  addCustomerAddress,
  getCustomerProfile,
  listCustomerAddresses,
  requestAccountDeletion,
  requestDataExport,
} from './customer-panel-service.js';
import {
  AccountDeletionSchema,
  AddAddressSchema,
  DataExportSchema,
  type AccountDeletionInput,
  type AddAddressInput,
  type DataExportInput,
} from './customer-panel.dto.js';

@Controller('api/store/customer')
@UseGuards(JwtAuthGuard)
export class CustomerPanelController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /** Profil özeti. */
  @Get('me')
  async me(@Req() req: AuthenticatedRequest): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const customerId = req.user?.sub;
    if (!customerId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Müşteri kimliği bulunamadı.');
    }
    const profile = await getCustomerProfile(this.prisma.client, tenantId, customerId);
    if (!profile) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Müşteri profili bulunamadı.');
    }
    return profile;
  }

  /** Adres defteri. */
  @Get('addresses')
  async addresses(@Req() req: AuthenticatedRequest): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const customerId = req.user?.sub;
    if (!customerId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Müşteri kimliği bulunamadı.');
    }
    return listCustomerAddresses(this.prisma.client, tenantId, customerId);
  }

  /** Yeni adres ekleme. */
  @Post('addresses')
  @HttpCode(201)
  async addAddress(
    @Body(new ZodValidationPipe(AddAddressSchema)) body: AddAddressInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const customerId = req.user?.sub;
    if (!customerId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Müşteri kimliği bulunamadı.');
    }
    return addCustomerAddress(this.prisma.client, tenantId, customerId, {
      fullName: body.fullName,
      phone: body.phone ?? '',
      city: body.city,
      district: body.district,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      postalCode: body.postalCode,
      country: body.country,
      isDefault: body.isDefault,
      kind: body.kind,
    });
  }

  /** KVKK veri ihraç talebi. */
  @Post('data-export')
  @HttpCode(202)
  async dataExport(
    @Body(new ZodValidationPipe(DataExportSchema)) _body: DataExportInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const customerId = req.user?.sub;
    if (!customerId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Müşteri kimliği bulunamadı.');
    }
    const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    return requestDataExport(this.prisma.client, tenantId, customerId, ip);
  }

  /** KVKK hesap silme talebi. */
  @Post('delete')
  @HttpCode(202)
  async deleteAccount(
    @Body(new ZodValidationPipe(AccountDeletionSchema)) _body: AccountDeletionInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const customerId = req.user?.sub;
    if (!customerId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Müşteri kimliği bulunamadı.');
    }
    const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    return requestAccountDeletion(this.prisma.client, tenantId, customerId, ip);
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