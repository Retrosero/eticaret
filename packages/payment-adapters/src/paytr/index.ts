/**
 * PayTR iFrame API v2 ödeme adaptörü (sandbox destekli).
 *
 * PayTR entegrasyonu için iFrame API kullanılır. Akış:
 *   1. Sunucu tarafında `createPaymentIntent` çağrılır → PayTR `/api/get-token` endpoint'ine
 *      `merchant_id + merchant_key + merchant_salt + basket` HMAC SHA256 ile imzalanmış payload gönderilir.
 *   2. Dönen `token` frontend'e iletilir, PayTR iframe'e basılır.
 *   3. Kullanıcı ödemeyi tamamlar → PayTR callback URL'ine POST atar (form-urlencoded).
 *   4. Backend `handleWebhook` ile imzayı doğrular, siparişi günceller.
 *
 * Güvenlik:
 *   - Her istek HMAC SHA256 ile imzalanır (`paytr_token` = base64(HMAC(merchant_key, ...))).
 *   - Webhook imzası `merchant_oid + merchant_salt + status + total_amount` üzerinden hesaplanır.
 *   - API anahtarları tenant başına izole, kod içine hard-code edilmez.
 *   - Idempotency `merchant_oid` üzerinden sağlanır (PayTR tarafında 30 dk TTL).
 *
 * Yapılandırma eşlemesi (ProviderConfig → PayTR):
 *   - apiKey      → merchant_id
 *   - apiSecret   → merchant_key (HMAC anahtarı)
 *   - extras.merchantSalt → merchant_salt
 *
 * PayTR tek bir base URL kullanır; sandbox/prod ayrımı `merchant_id` ve `merchant_key`'den gelir.
 * Base URL: https://www.paytr.com/odeme
 * iFrame URL: https://www.paytr.com/odeme/guvenli/{token}
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

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

/** PayTR base URL (sandbox/prod ortak). */
const PAYTR_BASE_URL = 'https://www.paytr.com/odeme';

/** PayTR iframe URL şablonu (token sona eklenir). */
const PAYTR_IFRAME_URL = 'https://www.paytr.com/odeme/guvenli/';

/** PayTR API sürümü (header'da/debuğda paylaşılır). */
const PAYTR_API_VERSION = '2.0.0';

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

/** PayTR `get-token` yanıtı. */
interface PaytrTokenResponse {
  status: 'success' | 'failed';
  token?: string;
  reason?: string;
}

/** PayTR `status` sorgu yanıtı. */
interface PaytrStatusResponse {
  status: 'success' | 'failed';
  reason?: string;
  payment_amount?: string;
  payment_total?: string;
  payment_status?: '0' | '1' | '2' | '3' | '4' | '5' | '6';
  payment_type?: string;
  currency?: string;
  merchant_oid?: string;
  test_mode?: '0' | '1';
  installment_count?: string;
}

/** PayTR `refund` yanıtı. */
interface PaytrRefundResponse {
  status: 'success' | 'failed';
  reason?: string;
  refund_amount?: string;
  merchant_oid?: string;
}

/** PayTR `callback` form-urlencoded alanları. */
export interface PaytrCallbackFields {
  merchant_oid: string;
  status: 'success' | 'failed';
  total_amount: string;
  hash: string;
  failed_reason_code?: string;
  failed_reason_msg?: string;
  test_mode?: '0' | '1';
  payment_type?: string;
  currency?: string;
  payment_amount?: string;
  installment_count?: string;
}

/** PayTR ödeme yöntemi eşlemesi (eticart → PayTR). */
const PAYTR_PAYMENT_METHOD_MAP: Record<string, string> = {
  credit_card: 'card',
  debit_card: 'card',
  bank_transfer: 'eft',
  wallet: 'card',
  cash_on_delivery: 'eft',
};

/** PayTR ödeme durumu kodu → eticart standart durum. */
const PAYTR_STATUS_MAP: Record<string, PaymentIntentStatus> = {
  '0': 'failed',         // Başarısız
  '1': 'succeeded',      // Başarılı
  '2': 'pending',        // 3D doğrulama aşamasında
  '3': 'processing',     // Banka tarafında işlemde
  '4': 'refunded',       // İade tamamlandı
  '5': 'refunded',       // İade tamamlandı (alternatif)
  '6': 'failed',         // İade reddedildi
};

/** Sepet kalemi (PayTR `user_basket` JSON array). */
interface PaytrBasketItem {
  name: string;
  price: string; // TL string (2 ondalık, nokta ile)
  quantity: number;
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

// ---------------------------------------------------------------------------
// PayTR sağlayıcısı
// ---------------------------------------------------------------------------

/**
 * PayTR sağlayıcısı.
 *
 * Tek instance, birden fazla tenant'a hizmet edebilir. Her `createPaymentIntent`
 * çağrısında `init` ile set edilen yapılandırma kullanılır; gerçek akışta her tenant
 * için ayrı provider instance veya init cache kullanılabilir.
 */
export class PaytrProvider implements PaymentProvider {
  public readonly code: PaymentProviderCode = 'paytr';

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
    if (!config.tenantId) throw new Error('tenantId zorunlu');
    if (!config.apiKey) throw new Error('PayTR merchant_id zorunlu (apiKey)');
    if (!config.apiSecret) throw new Error('PayTR merchant_key zorunlu (apiSecret)');
    const salt = config.extras?.['merchantSalt'];
    if (!salt || typeof salt !== 'string') {
      throw new Error('PayTR merchant_salt zorunlu (config.extras.merchantSalt)');
    }
    this.config = config;
    this.logger?.info(
      { tenantId: config.tenantId, sandbox: config.sandbox },
      'PayTR sağlayıcısı başlatıldı',
    );
  }

  // -------------------------------------------------------------------------
  // Yardımcılar
  // -------------------------------------------------------------------------

  /** `merchant_key` döner. */
  private merchantKey(): string {
    if (!this.config) throw new Error('PayTR init() çağrılmamış');
    return this.config.apiSecret;
  }

  /** `merchant_salt` döner. */
  private merchantSalt(): string {
    if (!this.config) throw new Error('PayTR init() çağrılmamış');
    const salt = this.config.extras?.['merchantSalt'];
    if (!salt || typeof salt !== 'string') {
      throw new Error('PayTR merchant_salt bulunamadı');
    }
    return salt;
  }

  /** `merchant_id` döner. */
  private merchantId(): string {
    if (!this.config) throw new Error('PayTR init() çağrılmamış');
    return this.config.apiKey;
  }

  /** `merchant_oid` üret (idempotency). */
  private buildMerchantOid(input: CreatePaymentInput): string {
    const safe = input.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    const ref = input.referenceId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
    return `${ref}-${safe}`.slice(0, 64);
  }

  /** Sepet kalemlerini PayTR'ın beklediği JSON string formatına dönüştür. */
  private buildBasketString(items: CreatePaymentInput['items']): string {
    const basket: PaytrBasketItem[] = items.map((it) => ({
      name: it.name.slice(0, 50),
      price: (it.price / 100).toFixed(2), // kuruş → TL string
      quantity: it.quantity,
    }));
    return JSON.stringify(basket);
  }

  /**
   * `paytr_token` üret: PayTR iFrame API v2 hash formülü.
   *
   *   hash = base64(HMAC_SHA256(merchant_key,
   *     merchant_oid + email + payment_amount + user_basket
   *     + no_installment + max_installment + currency + test_mode + user_ip))
   *
   * PayTR bu sıraya katiyetle uyulmasını ister; aksi halde token reddedilir.
   */
  private buildIframeToken(payload: {
    merchant_oid: string;
    email: string;
    payment_amount: string;
    user_basket: string;
    no_installment: string;
    max_installment: string;
    currency: string;
    test_mode: string;
    user_ip: string;
  }): string {
    const hashInput =
      payload.merchant_oid +
      payload.email +
      payload.payment_amount +
      payload.user_basket +
      payload.no_installment +
      payload.max_installment +
      payload.currency +
      payload.test_mode +
      payload.user_ip;
    return createHmac('sha256', this.merchantKey()).update(hashInput).digest('base64');
  }

  /** PayTR `status` sorgu token'ı: HMAC(merchant_key, merchant_oid). */
  private buildStatusToken(merchantOid: string): string {
    return createHmac('sha256', this.merchantKey()).update(merchantOid).digest('base64');
  }

  /** PayTR `refund` token'ı: HMAC(merchant_key, merchant_oid + refund_amount). */
  private buildRefundToken(merchantOid: string, amount: number): string {
    return createHmac('sha256', this.merchantKey())
      .update(merchantOid + String(amount))
      .digest('base64');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Ödeme başlat — PayTR `get-token` endpoint'i. */
  async createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent> {
    if (!this.config) throw new Error('PayTR init() çağrılmamış');

    const merchantOid = this.buildMerchantOid(input);
    const basketStr = this.buildBasketString(input.items);
    const testMode = this.config.sandbox ? '1' : '0';
    const paymentMethod =
      PAYTR_PAYMENT_METHOD_MAP[input.paymentMethod ?? 'credit_card'] ?? 'card';

    const tokenPayload = {
      merchant_oid: merchantOid,
      email: input.customer.email,
      payment_amount: String(input.amount),
      user_basket: basketStr,
      no_installment: '0',
      max_installment: '12',
      currency: input.currency,
      test_mode: testMode,
      user_ip: input.customer.ipAddress,
    };

    const paytrToken = this.buildIframeToken(tokenPayload);

    const payload: Record<string, string> = {
      merchant_id: this.merchantId(),
      merchant_key: this.merchantKey(),
      merchant_salt: this.merchantSalt(),
      ...tokenPayload,
      payment_type: paymentMethod,
      debug_on: this.config.sandbox ? '1' : '0',
      client_lang: 'tr',
      user_name: `${input.customer.firstName} ${input.customer.lastName}`.slice(0, 60),
      user_address: input.shippingAddress.address.slice(0, 200),
      user_phone: input.customer.phone,
      merchant_ok_url: input.successUrl,
      merchant_fail_url: input.failureUrl,
      timeout_limit: '30',
      paytr_token: paytrToken,
    };

    const formBody = new URLSearchParams(payload).toString();

    let raw: PaytrTokenResponse;
    try {
      const res = await this.fetcher(`${PAYTR_BASE_URL}/api/get-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-eticart-paytr-version': PAYTR_API_VERSION,
        },
        body: formBody,
      });
      if (res.status >= 500) {
        throw new Error(`PayTR get-token 5xx yanıt: ${res.status}`);
      }
      raw = JSON.parse(res.text) as PaytrTokenResponse;
    } catch (err) {
      this.logger?.error(
        { err, tenantId: input.tenantId, merchantOid },
        'PayTR get-token hatası',
      );
      throw new Error(
        `PayTR token isteği başarısız: ${err instanceof Error ? err.message : 'bilinmeyen hata'}`,
      );
    }

    if (raw.status !== 'success' || !raw.token) {
      this.logger?.error(
        { tenantId: input.tenantId, merchantOid, reason: raw.reason },
        'PayTR get-token başarısız',
      );
      return {
        providerReference: merchantOid,
        provider: this.code,
        status: 'failed',
        errorMessage: raw.reason,
        raw,
      };
    }

    return {
      providerReference: merchantOid,
      provider: this.code,
      status: 'pending',
      redirectUrl: `${PAYTR_IFRAME_URL}${raw.token}`,
      raw,
    };
  }

  /**
   * PayTR callback sonrası ödeme durumunu doğrula.
   *
   * PayTR `status` endpoint'ine merchant_oid göndererek ödeme sonucunu sorgular.
   * İmza doğrulaması `handleWebhook` içinde yapılır; burada yalnızca durum sorgulanır.
   */
  async confirmPayment(intentId: string, _callback: CallbackData): Promise<PaymentResult> {
    if (!this.config) throw new Error('PayTR init() çağrılmamış');

    const merchantOid = intentId;
    const payload = {
      merchant_id: this.merchantId(),
      merchant_oid: merchantOid,
      paytr_token: this.buildStatusToken(merchantOid),
    };
    const formBody = new URLSearchParams(payload).toString();

    let raw: PaytrStatusResponse;
    try {
      const res = await this.fetcher(`${PAYTR_BASE_URL}/api/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
      });
      raw = JSON.parse(res.text) as PaytrStatusResponse;
    } catch (err) {
      throw new Error(
        `PayTR status sorgusu başarısız: ${err instanceof Error ? err.message : 'bilinmeyen'}`,
      );
    }

    if (raw.status !== 'success') {
      return {
        providerReference: merchantOid,
        status: 'failed',
        amount: 0,
        currency: 'TRY',
        errorMessage: raw.reason ?? 'Ödeme durumu sorgulanamadı',
        raw,
      };
    }

    const paymentStatus = raw.payment_status ?? '0';
    return {
      providerReference: merchantOid,
      providerTransactionId: merchantOid,
      status: PAYTR_STATUS_MAP[paymentStatus] ?? 'failed',
      amount: raw.payment_total ? parseInt(raw.payment_total, 10) : 0,
      currency: (raw.currency as PaymentResult['currency']) ?? 'TRY',
      raw,
    };
  }

  /** İade başlat — PayTR `refund` endpoint'i. */
  async refund(input: RefundInput): Promise<RefundResult> {
    if (!this.config) throw new Error('PayTR init() çağrılmamış');

    const payload = {
      merchant_id: this.merchantId(),
      merchant_oid: input.providerReference,
      refund_amount: String(input.amount),
      paytr_token: this.buildRefundToken(input.providerReference, input.amount),
    };
    const formBody = new URLSearchParams(payload).toString();

    let raw: PaytrRefundResponse;
    try {
      const res = await this.fetcher(`${PAYTR_BASE_URL}/api/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
      });
      raw = JSON.parse(res.text) as PaytrRefundResponse;
    } catch (err) {
      throw new Error(
        `PayTR refund isteği başarısız: ${err instanceof Error ? err.message : 'bilinmeyen'}`,
      );
    }

    if (raw.status !== 'success') {
      return {
        success: false,
        amount: input.amount,
        currency: input.currency,
        errorMessage: raw.reason ?? 'İade başarısız',
        raw,
      };
    }

    return {
      success: true,
      providerRefundId: input.providerReference,
      amount: input.amount,
      currency: input.currency,
      raw,
    };
  }

  /** Ödeme durumu sorgula (confirmPayment ile aynı endpoint). */
  async getStatus(intentId: string): Promise<PaymentResult> {
    return this.confirmPayment(intentId, { token: intentId, status: 'success' });
  }

  /**
   * Webhook imza doğrulama ve parse.
   *
   * PayTR callback form-urlencoded POST olarak gelir. İmza:
   *   hash = base64(HMAC_SHA256(merchant_key,
   *     merchant_oid + merchant_salt + status + total_amount))
   *
   * Alternatif olarak JSON payload da kabul edilir.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    if (!this.config) throw new Error('PayTR init() çağrılmamış');

    const text = rawBody.toString('utf-8');
    let fields: Partial<PaytrCallbackFields>;
    if (text.startsWith('{')) {
      fields = JSON.parse(text) as Partial<PaytrCallbackFields>;
    } else {
      fields = Object.fromEntries(
        new URLSearchParams(text).entries(),
      ) as Partial<PaytrCallbackFields>;
    }

    if (
      !fields.merchant_oid ||
      !fields.status ||
      !fields.total_amount ||
      !fields.hash
    ) {
      throw new Error(
        'PayTR webhook: zorunlu alanlar eksik (merchant_oid, status, total_amount, hash)',
      );
    }

    // İmza doğrulama (HMAC SHA256 base64)
    const expectedHash = createHmac('sha256', this.merchantKey())
      .update(fields.merchant_oid + this.merchantSalt() + fields.status + fields.total_amount)
      .digest('base64');

    if (expectedHash.length !== signature.length) {
      throw new Error('PayTR webhook imzası geçersiz');
    }
    try {
      const ok = timingSafeEqual(Buffer.from(expectedHash), Buffer.from(signature));
      if (!ok) throw new Error('PayTR webhook imzası geçersiz');
    } catch {
      throw new Error('PayTR webhook imzası geçersiz');
    }

    const eventType = fields.status === 'success' ? 'payment.success' : 'payment.failed';
    const paymentStatus: PaymentIntentStatus = fields.status === 'success' ? 'succeeded' : 'failed';

    return {
      provider: this.code,
      eventType,
      providerReference: fields.merchant_oid,
      providerTransactionId: fields.merchant_oid,
      amount: fields.total_amount ? parseInt(fields.total_amount, 10) : undefined,
      currency: (fields.currency as WebhookEvent['currency']) ?? 'TRY',
      status: paymentStatus,
      raw: fields,
    };
  }
}

// ---------------------------------------------------------------------------
// Webhook imza yardımcıları (test ve dışarıdan doğrulama için)
// ---------------------------------------------------------------------------

/** PayTR webhook imzası üret (test fixture'ları için). */
export function signPaytrWebhook(
  merchantOid: string,
  merchantSalt: string,
  status: 'success' | 'failed',
  totalAmount: string,
  merchantKey: string,
): string {
  return createHmac('sha256', merchantKey)
    .update(merchantOid + merchantSalt + status + totalAmount)
    .digest('base64');
}

/** PayTR webhook imzasını dışarıdan doğrula. */
export function verifyPaytrWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  merchantKey: string,
  merchantSalt: string,
): boolean {
  if (!signature) return false;
  const text = rawBody.toString('utf-8');
  let fields: Partial<PaytrCallbackFields>;
  if (text.startsWith('{')) {
    fields = JSON.parse(text) as Partial<PaytrCallbackFields>;
  } else {
    fields = Object.fromEntries(
      new URLSearchParams(text).entries(),
    ) as Partial<PaytrCallbackFields>;
  }
  if (!fields.merchant_oid || !fields.status || !fields.total_amount) return false;
  const expected = signPaytrWebhook(
    fields.merchant_oid,
    merchantSalt,
    fields.status,
    fields.total_amount,
    merchantKey,
  );
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** iFrame URL üret (frontend integration için). */
export function buildPaytrIframeUrl(token: string): string {
  return `${PAYTR_IFRAME_URL}${token}`;
}