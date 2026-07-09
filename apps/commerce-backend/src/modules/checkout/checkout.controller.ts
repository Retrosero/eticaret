/**
 * Checkout Controller — REST API.
 *
 * Endpoint'ler (Faz 9):
 *  - POST /api/store/checkout         → ödeme başlat
 *  - POST /api/store/checkout/webhook → provider webhook (iyzico callback)
 *
 * Webhook güvenliği:
 *  - `X-Iyzico-Signature` (veya provider'a özel) header'ı HMAC SHA256
 *    ile doğrulanır.
 *  - İmza eşleşmezse 401 döner; gövde prisma'ya yazılmaz.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError, ErrorCode } from '@eticart/config';
import type { PaymentProviderRegistry, WebhookEvent } from '@eticart/payment-adapters';
import type { ShippingProviderRegistry } from '@eticart/shipping-adapters';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PrismaService, PRISMA_TOKEN } from '../../db/prisma.service.js';

import { startCheckout } from './checkout-service.js';
import {
  StartCheckoutSchema,
  type StartCheckoutInput,
} from './checkout.dto.js';
import {
  PAYMENT_REGISTRY_TOKEN,
  SHIPPING_REGISTRY_TOKEN,
} from './checkout.providers.js';

@Controller('api/store/checkout')
export class CheckoutController {
  constructor(
    @Inject(PRISMA_TOKEN) private readonly prisma: PrismaService,
    @Inject(PAYMENT_REGISTRY_TOKEN) private readonly paymentRegistry: PaymentProviderRegistry,
    @Inject(SHIPPING_REGISTRY_TOKEN) private readonly shippingRegistry: ShippingProviderRegistry,
  ) {}

  /**
   * Yeni ödeme başlatır. Sepeti doğrular, kargo/ödeme sağlayıcısını çağırır,
   * PENDING_PAYMENT durumunda sipariş oluşturur.
   */
  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  async start(
    @Body(new ZodValidationPipe(StartCheckoutSchema)) body: StartCheckoutInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    const tenantId = this.resolveTenant(req);
    const customerId = req.user?.sub;
    if (!customerId) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Müşteri kimliği bulunamadı.');
    }

    // IP adresi verilmediyse istek başlığından al
    const ipAddress = body.ipAddress ?? (req.ip ?? req.socket.remoteAddress ?? '0.0.0.0');

    return startCheckout(
      this.prisma.client,
      this.paymentRegistry,
      this.shippingRegistry,
      {
        tenantId,
        cartId: body.cartId,
        customerId,
        shippingAddressId: body.shippingAddressId,
        billingAddressId: body.billingAddressId,
        paymentProviderCode: body.paymentProviderCode,
        shippingProviderCode: body.shippingProviderCode,
        currency: body.currency,
        successUrl: body.successUrl,
        failureUrl: body.failureUrl,
        ipAddress,
        customerEmail: body.customerEmail,
        customerPhone: body.customerPhone,
      },
    );
  }

  /**
   * Provider webhook'u. İmza doğrulaması zorunludur; aksi halde 401.
   *
   * `X-Iyzico-Signature` HMAC SHA256(rawBody, providerSecret).
   * Prod'da provider secret tenant başına DB'den çekilir.
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-iyzico-signature') signature: string | undefined,
    @Body() rawBody: unknown,
  ): Promise<{ ok: true; event: string }> {
    // rawBody string olmalı (Express json parser + verify hook kullanır)
    const rawString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);

    if (!signature) {
      throw new ApiError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Webhook imzası eksik (x-iyzico-signature).',
      );
    }

    const secret = process.env['IYZICO_WEBHOOK_SECRET'] ?? process.env['JWT_SECRET'] ?? '';
    if (!secret) {
      throw new ApiError(
        500,
        ErrorCode.INTERNAL_SERVER_ERROR,
        'Webhook secret yapılandırılmamış.',
      );
    }

    if (!this.verifyHmac(rawString, signature, secret)) {
      throw new ApiError(401, ErrorCode.UNAUTHORIZED, 'Webhook imzası geçersiz.');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawString) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Webhook gövdesi JSON olarak ayrıştırılamadı.');
    }

    const event = this.normalizeIyzicoEvent(parsed);

    // TODO (Faz 10): provider'a göre sipariş/payment güncelleme job'u tetikle.
    // Bu endpoint Faz 9'da yalnızca imza doğrulama + parse sözleşmesini sağlar.
    return { ok: true, event: event.eventType };
  }

  /** HMAC SHA256 doğrulaması (timing-safe). */
  private verifyHmac(rawBody: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected.length !== signature.length) return false;
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  /** iyzico webhook payload'unu normalize eder. */
  private normalizeIyzicoEvent(body: Record<string, unknown>): WebhookEvent {
    const status = String(body['status'] ?? body['paymentStatus'] ?? '').toLowerCase();
    const eventType = String(body['iyziEventType'] ?? body['eventType'] ?? '');
    let normalized = eventType;
    if (status === 'success' || eventType === 'payment.success') {
      normalized = 'payment.success';
    } else if (status === 'failure' || eventType === 'payment.failed') {
      normalized = 'payment.failed';
    }
    return {
      provider: 'iyzico',
      eventType: normalized,
      providerReference:
        String(body['paymentConversationId'] ?? body['paymentId'] ?? ''),
      providerTransactionId: body['paymentId'] as string | undefined,
      amount: body['paidPrice']
        ? Math.round(Number(body['paidPrice']) * 100)
        : undefined,
      currency: (body['currency'] as 'TRY' | 'USD' | 'EUR' | 'GBP' | undefined) ?? 'TRY',
      status:
        status === 'success'
          ? 'succeeded'
          : status === 'failure'
            ? 'failed'
            : 'pending',
      raw: body,
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