/**
 * iyzico ödeme adaptörü (sandbox destekli).
 *
 * İyzico'nun `Checkout Form` akışını kullanır:
 *   1. Sunucu tarafında `initializeCheckoutForm` çağrılır → token + payWithIyzicoSignedUrl
 *   2. Frontend bu URL'e yönlendirilir → iyzico kendi 3D Secure popup'ını açar
 *   3. Kullanıcı doğrular → iyzico callback URL'ine `token` ile döner
 *   4. Sunucu `retrieveCheckoutForm` ile ödemeyi tamamlar
 *
 * Güvenlik:
 *   - API anahtarı + secret tenant başına izole
 *   - Webhook imza doğrulama `X-Iyzico-Signature` başlığı üzerinden HMAC SHA256
 *   - Idempotency `conversationId` üzerinden sağlanır
 *
 * Sandbox URL: https://sandbox-api.iyzipay.com
 * Prod URL:    https://api.iyzipay.com
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Logger } from '@eticart/config';

import type {
  CallbackData,
  CreatePaymentInput,
  PaymentIntent,
  PaymentIntentStatus,
  PaymentProvider,
  PaymentProviderCode,
  PaymentResult,
  ProviderConfig,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from '../index.js';

/** iyzico API kök URL'leri. */
const IYZICO_SANDBOX_URL = 'https://sandbox-api.iyzipay.com';
const IYZICO_PROD_URL = 'https://api.iyzipay.com';

/** iyzico API sürümü. */
const IYZICO_API_VERSION = '2.0.0';

/** HMAC SHA256 ile imzalanacak webhook imzası. */
const WEBHOOK_SIGNATURE_HEADER = 'x-iyzico-signature';

/** Webhook olay tipleri. */
const IYZICO_WEBHOOK_EVENT_TYPES = {
  PAYMENT_SUCCESS: 'payment.success',
  PAYMENT_FAILED: 'payment.failed',
  REFUND_SUCCESS: 'refund.success',
} as const;

/** iyzico kimlik bilgileri. */
export interface IyzicoCredentials {
  apiKey: string;
  secretKey: string;
  sandbox: boolean;
}

/** iyzico ham yanıt tipleri (Checkout Form). */
interface IyzicoCheckoutFormInitResponse {
  status: 'success' | 'failure';
  locale?: string;
  systemTime?: number;
  conversationId?: string;
  token?: string;
  checkoutFormContent?: string; // bazı yöntemlerde HTML
  payWithIyzicoSignedUrl?: string; // 3DS popup URL'i
  tokenExpiresAt?: number;
  paymentPageUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface IyzicoCheckoutFormRetrieveResponse {
  status: 'success' | 'failure';
  locale?: string;
  systemTime?: number;
  conversationId?: string;
  token?: string;
  paymentStatus?: string;
  paymentId?: string;
  paymentTransactionId?: string;
  price?: number;
  paidPrice?: number;
  currency?: string;
  installment?: number;
  paymentMethod?: string;
  cardFamily?: string;
  cardAssociation?: string;
  cardGeneration?: string;
  cardType?: string;
  fraudStatus?: number;
  basketId?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface IyzicoRefundResponse {
  status: 'success' | 'failure';
  locale?: string;
  systemTime?: number;
  conversationId?: string;
  paymentId?: string;
  paymentTransactionId?: string;
  price?: number;
  currency?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** HTTP fetch sarmalayıcı tipi (DI ile değiştirilebilir). */
export type Fetcher = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{ status: number; text: string }>;

/** Varsayılan fetch implementasyonu. */
const defaultFetcher: Fetcher = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, text: await res.text() };
};

/**
 * iyzico sağlayıcısı.
 *
 * Tek instance, birden fazla tenant'a hizmet eder. Her `createPaymentIntent`
 * çağrısında tenant başına `init` yapılabilir, ya da provider pool'da
 * tenant bazlı cache tutulur (Faz 6'da her tenant için tek instance).
 */
export class IyzicoProvider implements PaymentProvider {
  public readonly code: PaymentProviderCode = 'iyzico';

  /** Mevcut yapılandırma (init sonrası). */
  private config: ProviderConfig | null = null;
  /** Logger (DI opsiyonel). */
  private readonly logger: Logger | undefined;
  /** Fetch implementasyonu (test için değiştirilebilir). */
  private readonly fetcher: Fetcher;

  constructor(opts?: { logger?: Logger; fetcher?: Fetcher }) {
    this.logger = opts?.logger;
    this.fetcher = opts?.fetcher ?? defaultFetcher;
  }

  /** Tenant başına yapılandırma. */
  async init(config: ProviderConfig): Promise<void> {
    // Girdi doğrulama
    if (!config.tenantId) throw new Error('tenantId zorunlu');
    if (!config.apiKey || !config.apiSecret) {
      throw new Error('iyzico API anahtarı/secret zorunlu');
    }
    this.config = config;
    this.logger?.info(
      { tenantId: config.tenantId, sandbox: config.sandbox },
      'iyzico sağlayıcısı başlatıldı',
    );
  }

  /** API kök URL'i. */
  private baseUrl(): string {
    if (!this.config) throw new Error('iyzico init() çağrılmamış');
    return this.config.sandbox ? IYZICO_SANDBOX_URL : IYZICO_PROD_URL;
  }

  /** iyzico HTTP Basic Auth header'ı. */
  private authHeader(): string {
    if (!this.config) throw new Error('iyzico init() çağrılmamış');
    // iyzico API key + secret → base64
    const raw = `${this.config.apiKey}:${this.config.apiSecret}`;
    return `Basic ${Buffer.from(raw, 'utf-8').toString('base64')}`;
  }

  /** iyzico isteği yap. */
  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl()}${path}`;
    const bodyStr = JSON.stringify(body);
    const res = await this.fetcher(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader(),
        'x-iyzi-client-version': `eticart-commerce/${IYZICO_API_VERSION}`,
      },
      body: bodyStr,
    });
    if (res.status >= 500) {
      throw new Error(`iyzico ${path} 5xx yanıt: ${res.status}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      throw new Error(`iyzico ${path} yanıtı JSON değil: ${res.text.slice(0, 200)}`);
    }
    return parsed as T;
  }

  /** Ödeme başlat — Checkout Form initialize. */
  async createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent> {
    if (!this.config) throw new Error('iyzico init() çağrılmamış');

    const payload = {
      locale: 'tr',
      conversationId: input.idempotencyKey,
      price: this.formatPrice(input.amount),
      paidPrice: this.formatPrice(input.amount),
      currency: this.mapCurrency(input.currency),
      basketId: input.referenceId,
      paymentGroup: 'PRODUCT',
      paymentChannel: 'WEB',
      // İyzico'nun kuralları: callback URL zorunlu
      callbackUrl: input.successUrl,
      enabledInstallments: [1, 2, 3, 6, 9, 12],
      buyer: {
        id: input.customer.id ?? input.tenantId,
        name: input.customer.firstName,
        surname: input.customer.lastName,
        gsmNumber: input.customer.phone,
        email: input.customer.email,
        identityNumber: '11111111111', // iyzico zorunlu (KVKK için TC'yi biz vermeyiz, default kullanılır)
        registrationAddress: input.shippingAddress.address,
        ip: input.customer.ipAddress,
        city: input.customer.city,
        country: input.customer.country,
      },
      shippingAddress: {
        contactName: input.shippingAddress.contactName,
        city: input.shippingAddress.city,
        country: input.shippingAddress.country,
        address: input.shippingAddress.address,
        zipCode: input.shippingAddress.postalCode ?? '34000',
      },
      billingAddress: {
        contactName: input.billingAddress.contactName,
        city: input.billingAddress.city,
        country: input.billingAddress.country,
        address: input.billingAddress.address,
        zipCode: input.billingAddress.postalCode ?? '34000',
      },
      basketItems: input.items.map((it, idx) => ({
        id: it.id,
        name: it.name.slice(0, 100),
        category1: it.category.slice(0, 50),
        itemType: it.itemType ?? 'PHYSICAL',
        price: this.formatPrice(it.price),
        quantity: it.quantity,
        subMerchantKey: undefined,
        subMerchantPrice: undefined,
        index: idx,
      })),
    };

    const raw = await this.request<IyzicoCheckoutFormInitResponse>(
      '/payment/iyzipos/checkoutform/initialize/auth/ecom',
      payload,
    );

    if (raw.status !== 'success' || !raw.token) {
      this.logger?.error(
        {
          tenantId: input.tenantId,
          referenceId: input.referenceId,
          errorCode: raw.errorCode,
          errorMessage: raw.errorMessage,
        },
        'iyzico checkoutForm initialize başarısız',
      );
      return {
        providerReference: raw.token ?? '',
        provider: this.code,
        status: 'failed',
        raw,
      };
    }

    return {
      providerReference: raw.token,
      provider: this.code,
      status: 'pending',
      redirectUrl:
        raw.payWithIyzicoSignedUrl ??
        raw.paymentPageUrl ??
        `${this.baseUrl()}/payment/iyzipos/checkoutform/initialize/result/${raw.token}`,
      raw,
    };
  }

  /** 3DS callback'i sonrası ödemeyi tamamla. */
  async confirmPayment(_intentId: string, callback: CallbackData): Promise<PaymentResult> {
    if (!this.config) throw new Error('iyzico init() çağrılmamış');

    // iyzico Checkout Form retrieve — token ile ödeme tamamla
    const raw = await this.request<IyzicoCheckoutFormRetrieveResponse>(
      '/payment/iyzipos/checkoutform/auth/ecom/detail',
      {
        locale: 'tr',
        conversationId: callback.token,
        token: callback.token,
      },
    );

    if (raw.status !== 'success') {
      this.logger?.warn(
        {
          token: callback.token,
          errorCode: raw.errorCode,
          errorMessage: raw.errorMessage,
        },
        'iyzico checkoutForm retrieve başarısız',
      );
      return {
        providerReference: callback.token,
        status: 'failed',
        amount: 0,
        currency: 'TRY',
        errorCode: raw.errorCode,
        errorMessage: raw.errorMessage ?? 'Ödeme tamamlanamadı',
        raw,
      };
    }

    const status = this.mapPaymentStatus(raw.paymentStatus);
    return {
      providerReference: callback.token,
      providerTransactionId: raw.paymentTransactionId,
      status,
      amount: Math.round(Number(raw.paidPrice ?? raw.price ?? '0') * 100),
      currency: this.mapCurrencyBack(raw.currency),
      raw,
    };
  }

  /** İade başlat. */
  async refund(input: RefundInput): Promise<RefundResult> {
    if (!this.config) throw new Error('iyzico init() çağrılmamış');

    const payload: Record<string, unknown> = {
      locale: 'tr',
      conversationId: input.idempotencyKey,
      paymentTransactionId: input.providerTransactionId ?? input.providerReference,
      currency: this.mapCurrency(input.currency),
      price: this.formatPrice(input.amount),
      ip: '85.34.78.112', // iyzico refund IP zorunluluğu (gerçek akışta tenant admin IP'si)
    };

    const raw = await this.request<IyzicoRefundResponse>(
      '/payment/refund',
      payload,
    );

    if (raw.status !== 'success') {
      return {
        success: false,
        amount: input.amount,
        currency: input.currency,
        errorCode: raw.errorCode,
        errorMessage: raw.errorMessage ?? 'İade başarısız',
        raw,
      };
    }
    return {
      success: true,
      providerRefundId: raw.paymentTransactionId,
      amount: input.amount,
      currency: input.currency,
      raw,
    };
  }

  /** Ödeme durumu sorgula. */
  async getStatus(intentId: string): Promise<PaymentResult> {
    // Checkout Form retrieve ile sorgulanır
    const raw = await this.request<IyzicoCheckoutFormRetrieveResponse>(
      '/payment/iyzipos/checkoutform/auth/ecom/detail',
      {
        locale: 'tr',
        conversationId: intentId,
        token: intentId,
      },
    );
    if (raw.status !== 'success') {
      return {
        providerReference: intentId,
        status: 'failed',
        amount: 0,
        currency: 'TRY',
        errorCode: raw.errorCode,
        errorMessage: raw.errorMessage ?? 'Sorgu başarısız',
        raw,
      };
    }
    return {
      providerReference: intentId,
      providerTransactionId: raw.paymentTransactionId,
      status: this.mapPaymentStatus(raw.paymentStatus),
      amount: Math.round(Number(raw.paidPrice ?? raw.price ?? '0') * 100),
      currency: this.mapCurrencyBack(raw.currency),
      raw,
    };
  }

  /** Webhook imza doğrulama ve parse. */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    if (!this.config) throw new Error('iyzico init() çağrılmamış');

    // iyzico webhook imza doğrulama: HMAC SHA256(secret, body)
    const expected = createHmac('sha256', this.config.apiSecret).update(rawBody).digest('hex');
    const safeEqual = (a: string, b: string): boolean => {
      if (a.length !== b.length) return false;
      try {
        return timingSafeEqual(Buffer.from(a), Buffer.from(b));
      } catch {
        return false;
      }
    };
    if (!safeEqual(expected, signature)) {
      throw new Error('Webhook imzası geçersiz');
    }

    const body = JSON.parse(rawBody.toString('utf-8')) as {
      paymentConversationId?: string;
      paymentId?: string;
      status?: string;
      paymentStatus?: string;
      paidPrice?: number;
      currency?: string;
      eventType?: string;
      iyziEventType?: string;
    };

    const eventType = body.eventType ?? body.iyziEventType ?? '';
    const status = this.mapPaymentStatus(body.paymentStatus ?? body.status);

    let normalizedEvent = eventType;
    if (eventType === 'payment.success' || status === 'succeeded') {
      normalizedEvent = IYZICO_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCESS;
    } else if (eventType === 'payment.failed' || status === 'failed') {
      normalizedEvent = IYZICO_WEBHOOK_EVENT_TYPES.PAYMENT_FAILED;
    }

    return {
      provider: this.code,
      eventType: normalizedEvent,
      providerReference: body.paymentConversationId ?? body.paymentId ?? '',
      providerTransactionId: body.paymentId,
      amount: body.paidPrice ? Math.round(body.paidPrice * 100) : undefined,
      currency: this.mapCurrencyBack(body.currency),
      status,
      raw: body,
    };
  }

  /** iyzico para birimi kodu. */
  private mapCurrency(c: string): string {
    return c; // TRY, USD, EUR, GBP — iyzico aynı kodları kabul eder
  }

  /** iyzico para birimini geri dönüştür. */
  private mapCurrencyBack(c: string | undefined): 'TRY' | 'USD' | 'EUR' | 'GBP' {
    if (c === 'USD' || c === 'EUR' || c === 'GBP') return c;
    return 'TRY';
  }

  /** Kuruş → ondalık string (iyzico 2 ondalık ister). */
  private formatPrice(minor: number): string {
    return (minor / 100).toFixed(2);
  }

  /** iyzico paymentStatus → standart durum. */
  private mapPaymentStatus(s: string | undefined): PaymentIntentStatus {
    if (!s) return 'pending';
    const upper = s.toUpperCase();
    if (upper === 'SUCCESS') return 'succeeded';
    if (upper === 'FAILURE' || upper === 'FAILED') return 'failed';
    if (upper === 'PENDING') return 'pending';
    if (upper === 'PROCESSING') return 'processing';
    if (upper === 'REFUNDED') return 'refunded';
    if (upper === 'PARTIAL_REFUNDED' || upper === 'PARTIALLY_REFUNDED') return 'partially_refunded';
    if (upper === 'CANCELLED' || upper === 'CANCELED') return 'cancelled';
    return 'pending';
  }
}

/** Webhook imza doğrulama yardımcısı (header → hex). */
export function verifyIyzicoWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== signatureHeader.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/** Webhook imza üretme (test için). */
export function signIyzicoWebhook(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/** Header adı. */
export const IYZICO_WEBHOOK_HEADER = WEBHOOK_SIGNATURE_HEADER;