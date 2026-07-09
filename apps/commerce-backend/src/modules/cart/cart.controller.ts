/**
 * Sepet (Cart) Controller — REST API.
 *
 * Endpoint'ler (Faz 9):
 *  - POST   /api/store/cart           → aktif sepeti getir veya oluştur
 *  - GET    /api/store/cart           → aktif sepeti (oturum) getir
 *  - POST   /api/store/cart/items     → sepete kalem ekle
 *  - PATCH  /api/store/cart/items/:id → kalem güncelle
 *  - DELETE /api/store/cart/items/:id → kalem sil
 *
 * Tenant bağlamı JWT payload'ından (`tenantId`) çözümlenir; anonim
 * sessionKey tabanlı sepetlerde customerId opsiyoneldir.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
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
  addToCart,
  getOrCreateCart,
  recalculateCartTotals,
  removeCartItem,
  updateCartItem,
} from './cart-service.js';
import {
  AddToCartSchema,
  GetOrCreateCartSchema,
  UpdateCartItemSchema,
  type AddToCartInput,
  type GetOrCreateCartInput,
  type UpdateCartItemInput,
} from './cart.dto.js';

@Controller('api/store/cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
  ) {}

  /**
   * Aktif sepeti getirir; yoksa yeni oluşturur.
   * Hem oturum açmış müşteriler (customerId) hem anonim sessionKey desteklenir.
   */
  @Post()
  @HttpCode(200)
  async getOrCreate(
    @Body(new ZodValidationPipe(GetOrCreateCartSchema)) body: GetOrCreateCartInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    // Auth altındaki müşteri (sub) tercih edilir; body.customerId sadece
    // anonim session'larda veya test amaçlı kullanılır.
    const customerId = body.customerId ?? req.user?.sub ?? null;
    const sessionKey = body.sessionKey ?? null;

    if (!customerId && !sessionKey) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'customerId veya sessionKey zorunludur.',
      );
    }
    return getOrCreateCart(this.prisma.client, tenantId, {
      customerId,
      sessionKey,
    });
  }

  /** Oturum açmış kullanıcının aktif sepetini toplamlarla döner. */
  @Get()
  async getActive(@Req() req: AuthenticatedRequest): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const customerId = req.user?.sub ?? null;
    if (!customerId) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'Aktif sepet için oturum açın veya sessionKey ile POST kullanın.',
      );
    }
    const cart = await getOrCreateCart(this.prisma.client, tenantId, { customerId });
    const totals = await recalculateCartTotals(this.prisma.client, cart.id);
    return { ...cart, totals };
  }

  /** Sepete kalem ekler. */
  @Post('items')
  @HttpCode(201)
  async addItem(
    @Body(new ZodValidationPipe(AddToCartSchema)) body: AddToCartInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    return addToCart(this.prisma.client, {
      tenantId,
      customerId: req.user?.sub ?? null,
      sessionKey: (req.headers['x-session-key'] as string | undefined) ?? null,
      productId: body.productId,
      variantId: body.variantId ?? null,
      kind: body.kind as never,
      name: body.name,
      sku: body.sku ?? null,
      unitPrice: body.unitPrice,
      quantity: body.quantity,
      variantSnapshot: body.variantSnapshot ?? null,
      notes: body.notes ?? null,
    });
  }

  /** Sepet kalemini günceller (miktar veya not). */
  @Patch('items/:id')
  async updateItem(
    @Param('id') itemId: string,
    @Body(new ZodValidationPipe(UpdateCartItemSchema)) body: UpdateCartItemInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    await updateCartItem(this.prisma.client, {
      tenantId,
      cartItemId: itemId,
      quantity: body.quantity,
      notes: body.notes ?? null,
    });
    return { ok: true };
  }

  /** Sepet kalemini siler. */
  @Delete('items/:id')
  @HttpCode(204)
  async removeItem(
    @Param('id') itemId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const tenantId = this.resolveTenant(req);
    await removeCartItem(this.prisma.client, tenantId, itemId);
  }

  /**
   * Tenant kimliğini JWT payload'ından çözer.
   * super_admin için tenantId null olabilir; bu durumda 400 döneriz
   * (cart işlemleri her zaman tenant-scoped).
   */
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