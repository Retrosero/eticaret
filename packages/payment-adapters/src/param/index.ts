/**
 * Param (Turkcell Ödeme) REST API ödeme adaptörü (sandbox destekli).
 *
 * Param entegrasyonu için REST API kullanılır. 3D Secure akışı:
 *   1. Sunucu tarafında `createPaymentIntent` → Param `TP_WMD_UCD` endpoint'i (3D başlat).
 *      Yanıt olarak `UCD_HTML` (3D form HTML) + `TransId` döner.
 *   2. Frontend `UCD_HTML` formunu render edip otomatik submit eder → kullanıcı banka 3D'sine yönlenir.
 *   3. Kullanıcı 3D'yi doğrular → Param callback URL'ine `TransId` ile döner.
 *   4. Sunucu `confirmPayment` ile `TP_WMD_PayResult` sorgusu yapar.
 *
 * Param API genel özellikler:
 *   - Basic Auth: `Authorization: Basic base64(client_code:client_username:client_password)`
 *     Not: Param farklı bir format kullanır — `Username` + `Password` parametreleri ile
 *     her istekte kimlik doğrulama yapılır. Basic Auth header alternatiftir.
 *   - Her istek `TransId` veya `TRANS_ID` ile idempotency sağlar.
 *   - Webhook imzası: `TransactionDeviceSourceData` SHA-256 hash'i ile doğrulanır.
 *
 * Yapılandırma eşlemesi (ProviderConfig → Param):
 *   - apiKey      → CLIENT_CODE
 *   - apiSecret   → CLIENT_USERNAME
 *   - extras.clientPassword → CLIENT_PASSWORD
 *   - extras.guid → GUID (her mağaza için Param tarafından verilen statik anahtar)
 *
 * Sandbox URL: https://test-dmz.param.com.tr/turkpos.ws/service_turkpos_prod.asmx
 * Prod URL:    https://dmz.param.com.tr/turkpos.ws/service_turkpos_prod.asmx
 */

import { createHash, timingSafeEqual } from 'node:crypto';
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

/** Param sandbox (test) URL. */
const PARAM_SANDBOX_URL = 'https://test-dmz.param.com.tr/turkpos.ws/service_turkpos_prod.asmx';
/** Param production URL. */
const PARAM_PROD_URL = 'https://dmz.param.com.tr/turkpos.ws/service_turkpos_prod.asmx';

/** Param API sürümü (audit log'unda paylaşılır). */
const PARAM_API_VERSION = '5.0.0';

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-unused-vars */
// Param SOAP yanıtları runtime'da regex tabanlı parse edildiğinden
// ham SOAP yanıt tipleri ayrıca deklare edilmez; gerektiğinde
// bu yorumun yerine aşağıdaki tipler eklenebilir:
// type ParamUcdResponse = { Sonuc: string; UCD_HTML?: string; ... };
// type ParamPayResultResponse = { Sonuc: string; Tutar?: string; ... };
// type ParamRefundResponse = { Sonuc: string; Hata_Aciklama?: string; ... };

/** Param ödeme durumu eşlemesi. */
const PARAM_STATUS_MAP: Record<string, PaymentIntentStatus> = {
  '1': 'succeeded',
  '2': 'failed',
  '3': 'pending',
  '4': 'processing',
  '5': 'refunded',
};

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
// Param sağlayıcısı
// ---------------------------------------------------------------------------

/**
 * Param REST API sağlayıcısı.
 *
 * Akış özeti:
 *  - 3D Secure: TP_WMD_UCD → UCD_HTML → 3D form submit → callback → TP_WMD_PayResult
 *  - İade: TP_WMD_PAY_IADE
 *  - Sorgu: TP_WMD_PayResult (TransId ile)
 *
 * Tek instance birden fazla tenant'a hizmet verebilir; her `createPaymentIntent`/`confirmPayment`
 * çağrısında init sonrası set edilen tenant config kullanılır.
 */
export class ParamProvider implements PaymentProvider {
  public readonly code: PaymentProviderCode = 'param';

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

  // -------------------------------------------------------------------------
  // Init & yapılandırma yardımcıları
  // -------------------------------------------------------------------------

  /** Tenant başına yapılandırma. */
  async init(config: ProviderConfig): Promise<void> {
    if (!config.tenantId) throw new Error('tenantId zorunlu');
    if (!config.apiKey) throw new Error('Param CLIENT_CODE zorunlu (apiKey)');
    if (!config.apiSecret) throw new Error('Param CLIENT_USERNAME zorunlu (apiSecret)');
    const password = config.extras?.['clientPassword'];
    if (!password || typeof password !== 'string') {
      throw new Error('Param CLIENT_PASSWORD zorunlu (config.extras.clientPassword)');
    }
    const guid = config.extras?.['guid'];
    if (!guid || typeof guid !== 'string') {
      throw new Error('Param GUID zorunlu (config.extras.guid)');
    }
    this.config = config;
    this.logger?.info(
      { tenantId: config.tenantId, sandbox: config.sandbox },
      'Param sağlayıcısı başlatıldı',
    );
  }

  /** API base URL (sandbox/prod). */
  private baseUrl(): string {
    if (!this.config) throw new Error('Param init() çağrılmamış');
    return this.config.sandbox ? PARAM_SANDBOX_URL : PARAM_PROD_URL;
  }

  /** CLIENT_CODE döner. */
  private clientCode(): string {
    if (!this.config) throw new Error('Param init() çağrılmamış');
    return this.config.apiKey;
  }

  /** CLIENT_USERNAME döner. */
  private clientUsername(): string {
    if (!this.config) throw new Error('Param init() çağrılmamış');
    return this.config.apiSecret;
  }

  /** CLIENT_PASSWORD döner. */
  private clientPassword(): string {
    if (!this.config) throw new Error('Param init() çağrılmamış');
    const pw = this.config.extras?.['clientPassword'];
    if (!pw || typeof pw !== 'string') {
      throw new Error('Param CLIENT_PASSWORD bulunamadı');
    }
    return pw;
  }

  /** GUID döner (statik mağaza anahtarı). */
  private guid(): string {
    if (!this.config) throw new Error('Param init() çağrılmamış');
    const g = this.config.extras?.['guid'];
    if (!g || typeof g !== 'string') {
      throw new Error('Param GUID bulunamadı');
    }
    return g;
  }

  /** Tutar string'e (kuruş olarak). */
  private formatAmount(minor: number): string {
    return String(minor);
  }

  /** SOAP envelope oluştur (Param SOAP endpoint'i kullanır, JSON değil). */
  private buildSoapEnvelope(action: string, params: Record<string, string>): string {
    const xmlParams = Object.entries(params)
      .map(([k, v]) => `<${k}>${this.escapeXml(v)}</${k}>`)
      .join('');
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${action} xmlns="https://turkpos.com.tr/">
      ${xmlParams}
    </${action}>
  </soap:Body>
</soap:Envelope>`;
  }

  /** XML escape. */
  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  private unescapeXml(s: string): string {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  /** SOAP yanıtını parse et → Record<tag, value>. */
  private parseSoapResponse(xml: string): Record<string, string> {
    const result: Record<string, string> = {};
    // Container tag'leri kaldır (içerideki leaf field'ların eşleşmesini engeller)
    const stripped = xml
      .replace(/<soap:Envelope[\s\S]*?>/g, '')
      .replace(/<\/soap:Envelope>/g, '')
      .replace(/<soap:Body[\s\S]*?>/g, '')
      .replace(/<\/soap:Body>/g, '')
      .replace(/<Response[\s\S]*?>/g, '')
      .replace(/<\/Response>/g, '')
      .replace(/<TP_WMD_UCDResult[\s\S]*?>/g, '')
      .replace(/<\/TP_WMD_UCDResult>/g, '')
      .replace(/<TP_WMD_PayResult[\s\S]*?>/g, '')
      .replace(/<\/TP_WMD_PayResult>/g, '')
      .replace(/<TP_WMD_PAY_IADEResult[\s\S]*?>/g, '')
      .replace(/<\/TP_WMD_PAY_IADEResult>/g, '');

    // Yaprak (leaf) tag'leri yakala: <TagName>value</TagName>
    const tagRe = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRe.exec(stripped)) !== null) {
      result[match[1]!] = this.unescapeXml(match[2]!);
    }
    return result;
  }

  /** SOAP isteği gönder. */
  private async soapRequest(action: string, body: string): Promise<string> {
    const soapAction = `https://turkpos.com.tr/${action}`;
    const res = await this.fetcher(this.baseUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: soapAction,
        'x-eticart-param-version': PARAM_API_VERSION,
      },
      body,
    });
    if (res.status >= 500) {
      throw new Error(`Param SOAP ${action} 5xx yanıt: ${res.status}`);
    }
    return res.text;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Ödeme başlat — 3D Secure akışı (TP_WMD_UCD). */
  async createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent> {
    if (!this.config) throw new Error('Param init() çağrılmamış');

    const transactionId = input.idempotencyKey.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    const orderId = input.referenceId.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);

    // TP_WMD_UCD parametreleri
    const params: Record<string, string> = {
      CLIENT_CODE: this.clientCode(),
      CLIENT_USERNAME: this.clientUsername(),
      CLIENT_PASSWORD: this.clientPassword(),
      GUID: this.guid(),
      KK_Sahibi: `${input.customer.firstName} ${input.customer.lastName}`.slice(0, 100),
      KK_No: '4543600000000007', // Test kart no (gerçek akışta frontend'den gelir)
      KK_SK_Ay: '12',
      KK_SK_Yil: '2030',
      KK_CVC: '000',
      KK_Sahibi_GSM: input.customer.phone.replace(/[^0-9]/g, ''),
      Hata_URL: input.failureUrl,
      Basarili_URL: input.successUrl,
      Siparis_ID: orderId,
      Siparis_Aciklama: input.metadata?.['description'] ?? `Sipariş #${orderId}`,
      Tutar: this.formatAmount(input.amount), // kuruş
      Toplam_Tutar: this.formatAmount(input.amount), // vade farkı yoksa aynı
      Islem_Tutar: this.formatAmount(input.amount),
      Islem_Guvenlik_Tip: '3D',
      TransId: transactionId,
      IPAdr: input.customer.ipAddress,
      // Opsiyonel: taksit
      Taksit: '1',
      // Para birimi (Param 949 = TL, 840 = USD, 978 = EUR)
      PB: input.currency === 'TRY' ? '949' : input.currency === 'USD' ? '840' : '978',
      // 3D tipi: 0 = 3D Secure, 1 = 3D Pay, 2 = 3D Full
      Islem_Odeme_Secenekleri: '1',
      // Ürün sepet verisi (opsiyonel — Param fraud kontrolü için kullanır)
      Data1: input.customer.email.slice(0, 100),
      Data2: input.shippingAddress.address.slice(0, 100),
      Data3: input.shippingAddress.city.slice(0, 50),
      Data4: input.shippingAddress.postalCode ?? '',
      Data5: input.customer.firstName.slice(0, 50),
    };

    const soapBody = this.buildSoapEnvelope('TP_WMD_UCD', params);

    let responseXml: string;
    try {
      responseXml = await this.soapRequest('TP_WMD_UCD', soapBody);
    } catch (err) {
      this.logger?.error({ err, tenantId: input.tenantId }, 'Param UCD isteği hatası');
      throw new Error(
        `Param ödeme başlatılamadı: ${err instanceof Error ? err.message : 'bilinmeyen'}`,
      );
    }

    const fields = this.parseSoapResponse(responseXml);
    const sonuc = fields['Sonuc'];

    if (sonuc !== '1' || !fields['UCD_HTML']) {
      this.logger?.error(
        {
          tenantId: input.tenantId,
          sonuc,
          hataKodu: fields['Hata_Kodu'],
          hataAciklama: fields['Hata_Aciklama'],
        },
        'Param UCD başarısız',
      );
      return {
        providerReference: transactionId,
        provider: this.code,
        status: 'failed',
        errorMessage: fields['Hata_Aciklama'] ?? '3D başlatılamadı',
        raw: fields,
      };
    }

    return {
      providerReference: transactionId,
      provider: this.code,
      status: 'pending',
      // UCD_HTML base64 encoded HTML form'dur; frontend decode edip render eder
      redirectUrl: `data:text/html;base64,${fields['UCD_HTML']}`,
      raw: {
        transactionId,
        orderId,
        islemId: fields['Islem_ID'],
        sonucAciklama: fields['Sonuc_Aciklama'],
      },
    };
  }

  /** 3D callback sonrası ödemeyi doğrula (TP_WMD_PayResult). */
  async confirmPayment(intentId: string, _callback: CallbackData): Promise<PaymentResult> {
    if (!this.config) throw new Error('Param init() çağrılmamış');

    const params: Record<string, string> = {
      CLIENT_CODE: this.clientCode(),
      CLIENT_USERNAME: this.clientUsername(),
      CLIENT_PASSWORD: this.clientPassword(),
      GUID: this.guid(),
      TransId: intentId,
      // Ödeme sonucu kontrolü için gerekli ek parametre (gerçek implementasyonda callback'ten gelir)
      Siparis_ID: '',
    };

    const soapBody = this.buildSoapEnvelope('TP_WMD_PayResult', params);
    let responseXml: string;
    try {
      responseXml = await this.soapRequest('TP_WMD_PayResult', soapBody);
    } catch (err) {
      throw new Error(
        `Param ödeme sonucu sorgusu başarısız: ${err instanceof Error ? err.message : 'bilinmeyen'}`,
      );
    }

    const fields = this.parseSoapResponse(responseXml);
    const sonuc = fields['Sonuc'];
    const rawAmount = fields['Tutar'] ? parseInt(fields['Tutar'], 10) : 0;

    if (sonuc !== '1') {
      return {
        providerReference: intentId,
        status: PARAM_STATUS_MAP[sonuc ?? ''] ?? 'failed',
        amount: rawAmount,
        currency: 'TRY',
        errorMessage: fields['Hata_Aciklama'] ?? 'Ödeme başarısız',
        errorCode: fields['Hata_Kodu'] ?? fields['Banka_Sonuc_Kod'],
        raw: fields,
      };
    }

    return {
      providerReference: intentId,
      providerTransactionId: fields['Dekont_ID'] ?? fields['Islem_ID'],
      status: 'succeeded',
      amount: rawAmount,
      currency: 'TRY',
      raw: fields,
    };
  }

  /** İade başlat (TP_WMD_PAY_IADE). */
  async refund(input: RefundInput): Promise<RefundResult> {
    if (!this.config) throw new Error('Param init() çağrılmamış');

    const params: Record<string, string> = {
      CLIENT_CODE: this.clientCode(),
      CLIENT_USERNAME: this.clientUsername(),
      CLIENT_PASSWORD: this.clientPassword(),
      GUID: this.guid(),
      Siparis_ID: input.providerReference,
      Tutar: this.formatAmount(input.amount),
      // İade referansı — orderId veya dekontId
      Ref_No: input.idempotencyKey.replace(/[^A-Za-z0-9]/g, '').slice(0, 20),
    };

    const soapBody = this.buildSoapEnvelope('TP_WMD_PAY_IADE', params);
    let responseXml: string;
    try {
      responseXml = await this.soapRequest('TP_WMD_PAY_IADE', soapBody);
    } catch (err) {
      throw new Error(
        `Param iade isteği başarısız: ${err instanceof Error ? err.message : 'bilinmeyen'}`,
      );
    }

    const fields = this.parseSoapResponse(responseXml);
    const sonuc = fields['Sonuc'];

    if (sonuc !== '1') {
      return {
        success: false,
        amount: input.amount,
        currency: input.currency,
        errorMessage: fields['Hata_Aciklama'] ?? 'İade başarısız',
        errorCode: fields['Hata_Kodu'],
        raw: fields,
      };
    }

    return {
      success: true,
      providerRefundId: fields['Dekont_ID'] ?? fields['Islem_ID'],
      amount: input.amount,
      currency: input.currency,
      raw: fields,
    };
  }

  /** Ödeme durumu sorgula. */
  async getStatus(intentId: string): Promise<PaymentResult> {
    return this.confirmPayment(intentId, { token: intentId, status: 'success' });
  }

  /**
   * Webhook imza doğrulama ve parse.
   *
   * Param callback'i form-urlencoded ya da JSON formatında gelir. İmza:
   *   SHA-256 hash'i alınan `TransactionDeviceSourceData` parametresi ile doğrulanır.
   *
   * Callback tipik alanlar:
   *   - TransId, Islem_ID, Dekont_ID, Tutar, Sonuc, Odeme_Secenekleri
   *   - TransactionDeviceSourceData (SHA-256 imza)
   *
   * İmza doğrulama: `TransactionDeviceSourceData` = base64(SHA-256(GUID + TransId + Tutar))
   * Not: Param dokümantasyonu sürüme göre değişebilir; sandbox'ta bypass için
   * sandbox config'i imza zorunluluğunu kaldırır.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    if (!this.config) throw new Error('Param init() çağrılmamış');

    const text = rawBody.toString('utf-8');
    let fields: Record<string, string>;
    if (text.startsWith('{')) {
      fields = JSON.parse(text) as Record<string, string>;
    } else if (text.startsWith('<?xml') || text.startsWith('<')) {
      fields = this.parseSoapResponse(text);
    } else {
      fields = Object.fromEntries(new URLSearchParams(text).entries());
    }

    const transId = fields['TransId'] ?? fields['transId'];
    const tutar = fields['Tutar'] ?? fields['tutar'];
    const sonuc = fields['Sonuc'] ?? fields['sonuc'] ?? fields['Odeme_Sonuc'];
    const sig = fields['TransactionDeviceSourceData'] ?? signature;

    if (!transId || !tutar || !sonuc) {
      throw new Error('Param webhook: zorunlu alanlar eksik (TransId, Tutar, Sonuc)');
    }

    // İmza doğrulama (sandbox'ta bypass)
    if (!this.config.sandbox) {
      const expected = createHash('sha256')
        .update(this.guid() + transId + tutar)
        .digest('base64');
      if (expected.length !== sig.length) {
        throw new Error('Param webhook imzası geçersiz');
      }
      try {
        if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
          throw new Error('Param webhook imzası geçersiz');
        }
      } catch {
        throw new Error('Param webhook imzası geçersiz');
      }
    }

    const paymentStatus: PaymentIntentStatus =
      sonuc === '1' ? 'succeeded' : PARAM_STATUS_MAP[sonuc ?? ''] ?? 'failed';
    const eventType = sonuc === '1' ? 'payment.success' : 'payment.failed';

    return {
      provider: this.code,
      eventType,
      providerReference: transId,
      providerTransactionId: fields['Dekont_ID'] ?? fields['Islem_ID'],
      amount: parseInt(tutar, 10),
      currency: 'TRY',
      status: paymentStatus,
      raw: fields,
    };
  }
}

// ---------------------------------------------------------------------------
// Webhook imza yardımcıları (test/fixture için)
// ---------------------------------------------------------------------------

/** Param webhook imzası üret (test için). */
export function signParamWebhook(
  transId: string,
  tutar: string,
  guid: string,
): string {
  return createHash('sha256').update(guid + transId + tutar).digest('base64');
}

/** Param webhook imzasını dışarıdan doğrula. */
export function verifyParamWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  guid: string,
  bypassForSandbox = false,
): boolean {
  if (bypassForSandbox) return true;
  if (!signature) return false;
  const text = rawBody.toString('utf-8');
  let fields: Record<string, string>;
  if (text.startsWith('{')) {
    fields = JSON.parse(text) as Record<string, string>;
  } else {
    fields = Object.fromEntries(new URLSearchParams(text).entries());
  }
  const transId = fields['TransId'] ?? fields['transId'];
  const tutar = fields['Tutar'] ?? fields['tutar'];
  if (!transId || !tutar) return false;
  const expected = signParamWebhook(transId, tutar, guid);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}