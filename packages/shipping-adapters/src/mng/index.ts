/**
 * MNG Kargo REST API sağlayıcısı (OAuth2 + REST).
 *
 * MNG Kargo'nun sunduğu REST API OAuth2 ile korunur. Akış:
 *   1. init sırasında OAuth2 client_credentials ile access_token alınır, cache'lenir.
 *   2. createShipment → `POST /api/v2/shipments` → takip no (cargo barcode) döner.
 *   3. trackShipment → `GET /api/v2/tracking/{trackingNumber}` → durum + olay listesi.
 *   4. cancelShipment → `DELETE /api/v2/shipments/{trackingNumber}` → iptal.
 *   5. getRates → MNG'nin gerçek bir public pricing endpoint'i yok; pricing kuralları
 *      tenant config'inden uygulanır (Yurtiçi ile aynı mantık).
 *
 * Yapılandırma eşlemesi (ShippingProviderConfig):
 *   - apiKey     → OAuth2 client_id
 *   - apiSecret  → OAuth2 client_secret
 *   - extras.apiBaseUrl → MNG base URL (override)
 *   - extras.username → MNG kullanıcı adı (bazı endpoint'ler için)
 *   - extras.password → MNG şifresi (bazı endpoint'ler için)
 *   - extras.pricing → Manuel fiyat kuralları
 *
 * Base URL: https://api.mngkargo.com.tr (sandbox/prod aynı, auth farklı)
 * OAuth2 token URL: https://api.mngkargo.com.tr/oauth/token
 */

import type { Logger } from '@eticart/config';

import type {
  PackageDimensions,
  RateInput,
  Shipment,
  ShipmentInput,
  ShippingProvider,
  ShippingProviderCode,
  ShippingProviderConfig,
  ShippingRate,
  TrackingInfo,
} from '../index.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

const MNG_DEFAULT_BASE_URL = 'https://api.mngkargo.com.tr';
const MNG_OAUTH_TOKEN_PATH = '/oauth/token';
const MNG_SHIPMENTS_PATH = '/api/v2/shipments';
const MNG_TRACKING_PATH_PREFIX = '/api/v2/tracking';
// const MNG_PRICING_PATH = '/api/v2/pricing/quote'; // İleride pricing endpoint için

/** Token cache süresi (saniye). MNG access_token TTL genelde 1 saat. */
const TOKEN_TTL_SECONDS = 3600;
/** Token'ın süresinin dolmasına şu kadar saniye kala yenilenir. */
const TOKEN_REFRESH_MARGIN_SECONDS = 300;

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

interface MngOAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  /** Cache'lenme zamanı (epoch saniye). */
  cachedAt: number;
}

interface MngShipmentResponse {
  trackingNumber?: string;
  barcode?: string;
  estimatedDelivery?: string;
  status?: string;
  message?: string;
  errorCode?: string;
}

interface MngTrackingResponse {
  trackingNumber: string;
  status: string;
  events?: Array<{
    timestamp?: string;
    location?: string;
    status?: string;
    description?: string;
  }>;
  estimatedDelivery?: string;
}

interface MngCancelResponse {
  success?: boolean;
  message?: string;
}

interface MngTenantConfig {
  cfg: ShippingProviderConfig;
  pricing: MngPricingConfig;
}

export interface MngPricingConfig {
  perDesiMinor?: number;
  baseRateMinor?: number;
  freeShippingThresholdMinor?: number;
  sameCityDiscount?: number;
  codExtraFeeMinor?: number;
  estimatedDays?: number;
}

const DEFAULT_PRICING: MngPricingConfig = {
  perDesiMinor: 1300,
  baseRateMinor: 2900,
  freeShippingThresholdMinor: 50000,
  sameCityDiscount: 0.3,
  codExtraFeeMinor: 990,
  estimatedDays: 2,
};

// ---------------------------------------------------------------------------
// MNG sağlayıcısı
// ---------------------------------------------------------------------------

/** HTTP fetch sarmalayıcı tipi. */
export type Fetcher = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<{ status: number; text: string }>;

/** Varsayılan fetch implementasyonu. */
const defaultFetcher: Fetcher = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, text: await res.text() };
};

/**
 * MNG Kargo sağlayıcısı.
 *
 * OAuth2 token yönetimi + REST API ile tam entegrasyon.
 * Token tenant başına cache'lenir, süresi dolmadan yenilenir.
 */
export class MngProvider implements ShippingProvider {
  public readonly code: ShippingProviderCode = 'mng';

  /** Tenant başına config cache. */
  private readonly tenantConfigs = new Map<string, MngTenantConfig>();
  /** Tenant başına token cache. */
  private readonly tokenCache = new Map<string, MngOAuthToken>();
  /** Logger. */
  private readonly logger: Logger | undefined;
  /** Fetch implementasyonu (test için değiştirilebilir). */
  private readonly fetcher: Fetcher;

  constructor(opts?: { logger?: Logger; fetcher?: Fetcher }) {
    this.logger = opts?.logger;
    this.fetcher = opts?.fetcher ?? defaultFetcher;
  }

  // -------------------------------------------------------------------------
  // Init & yapılandırma
  // -------------------------------------------------------------------------

  async init(config: ShippingProviderConfig): Promise<void> {
    if (!config.tenantId) throw new Error('tenantId zorunlu');
    if (!config.apiKey) throw new Error('MNG OAuth2 client_id zorunlu (apiKey)');
    if (!config.apiSecret) throw new Error('MNG OAuth2 client_secret zorunlu (apiSecret)');

    const pricingInput = (config.extras?.['pricing'] as MngPricingConfig | undefined) ?? {};
    const pricing: MngPricingConfig = { ...DEFAULT_PRICING, ...pricingInput };

    this.tenantConfigs.set(config.tenantId, { cfg: config, pricing });

    // init'te token al (tenant için ilk kullanım öncesi önceden alalım — opsiyonel)
    try {
      await this.getAccessToken(config.tenantId);
      this.logger?.info({ tenantId: config.tenantId }, 'MNG Kargo sağlayıcısı başlatıldı');
    } catch (err) {
      // Token alınamadıysa sadece logla; lazy retry yapılır
      this.logger?.warn(
        { err, tenantId: config.tenantId },
        'MNG token ön-yüklemesi başarısız (lazy retry uygulanacak)',
      );
    }
  }

  /** Tenant config'i getir. */
  private getTenantConfig(tenantId: string): MngTenantConfig {
    const c = this.tenantConfigs.get(tenantId);
    if (!c) throw new Error('MNG sağlayıcısı tenant için başlatılmamış');
    return c;
  }

  /** Base URL'i getir. */
  private baseUrl(tenantId: string): string {
    const c = this.getTenantConfig(tenantId);
    const override = c.cfg.extras?.['apiBaseUrl'] as string | undefined;
    return override ?? MNG_DEFAULT_BASE_URL;
  }

  // -------------------------------------------------------------------------
  // OAuth2 token yönetimi
  // -------------------------------------------------------------------------

  /**
   * OAuth2 access_token getir. Cache TTL'i dolmuşsa yeniden alır.
   * MNG `client_credentials` grant type kullanır.
   */
  private async getAccessToken(tenantId: string): Promise<string> {
    const cached = this.tokenCache.get(tenantId);
    if (cached) {
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = cached.cachedAt + cached.expires_in;
      if (now < expiresAt - TOKEN_REFRESH_MARGIN_SECONDS) {
        return cached.access_token;
      }
    }

    const tc = this.getTenantConfig(tenantId);
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: tc.cfg.apiKey!,
      client_secret: tc.cfg.apiSecret!,
    }).toString();

    const res = await this.fetcher(`${this.baseUrl(tenantId)}${MNG_OAUTH_TOKEN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    if (res.status >= 500) {
      throw new Error(`MNG OAuth 5xx yanıt: ${res.status}`);
    }
    let parsed: { access_token?: string; token_type?: string; expires_in?: number; error?: string };
    try {
      parsed = JSON.parse(res.text) as typeof parsed;
    } catch {
      throw new Error('MNG OAuth yanıtı JSON değil');
    }
    if (!parsed.access_token) {
      throw new Error(`MNG OAuth token alınamadı: ${parsed.error ?? res.text.slice(0, 100)}`);
    }

    const token: MngOAuthToken = {
      access_token: parsed.access_token,
      token_type: parsed.token_type ?? 'Bearer',
      expires_in: parsed.expires_in ?? TOKEN_TTL_SECONDS,
      cachedAt: Math.floor(Date.now() / 1000),
    };
    this.tokenCache.set(tenantId, token);
    return token.access_token;
  }

  /** Token cache'ini temizle. */
  clearTokenCache(tenantId?: string): void {
    if (tenantId) this.tokenCache.delete(tenantId);
    else this.tokenCache.clear();
  }

  // -------------------------------------------------------------------------
  // Yetkili istekler
  // -------------------------------------------------------------------------

  /** Yetkili GET isteği. */
  private async authedGet<T>(tenantId: string, path: string): Promise<T> {
    const token = await this.getAccessToken(tenantId);
    const res = await this.fetcher(`${this.baseUrl(tenantId)}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (res.status >= 500) {
      throw new Error(`MNG ${path} 5xx yanıt: ${res.status}`);
    }
    return JSON.parse(res.text) as T;
  }

  /** Yetkili POST isteği. */
  private async authedPost<T>(tenantId: string, path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken(tenantId);
    const res = await this.fetcher(`${this.baseUrl(tenantId)}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.status >= 500) {
      throw new Error(`MNG ${path} 5xx yanıt: ${res.status}`);
    }
    return JSON.parse(res.text) as T;
  }

  /** Yetkili DELETE isteği. */
  private async authedDelete<T>(tenantId: string, path: string): Promise<T> {
    const token = await this.getAccessToken(tenantId);
    const res = await this.fetcher(`${this.baseUrl(tenantId)}${path}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (res.status >= 500) {
      throw new Error(`MNG ${path} 5xx yanıt: ${res.status}`);
    }
    return JSON.parse(res.text) as T;
  }

  // -------------------------------------------------------------------------
  // Paket desi hesabı (Yurtiçi ile aynı mantık)
  // -------------------------------------------------------------------------

  private pkgDesi(pkg: PackageDimensions): number {
    if (pkg.desi > 0) return pkg.desi;
    if (pkg.widthCm && pkg.heightCm && pkg.lengthCm) {
      return Math.ceil((pkg.widthCm * pkg.heightCm * pkg.lengthCm) / 3000);
    }
    return 1;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Fiyat teklifi.
   *
   * MNG'nin public pricing endpoint'i olmadığından tenant config'inden hesaplanır.
   * Gerçek production senaryosunda tenant sözleşme fiyatları `pricing` üzerinden verilir.
   */
  async getRates(input: RateInput): Promise<ShippingRate[]> {
    const tc = this.getTenantConfig(input.tenantId);
    const pricing = tc.pricing;

    // Ücretsiz kargo limiti
    if (
      pricing.freeShippingThresholdMinor !== undefined &&
      (input.orderTotalMinor ?? 0) >= pricing.freeShippingThresholdMinor
    ) {
      return [
        {
          provider: this.code,
          amountMinor: 0,
          currency: 'TRY',
          estimatedDays: pricing.estimatedDays ?? 2,
          serviceName: 'MNG Standart',
          serviceCode: 'MNG_STD',
          metadata: { freeShipping: true },
        },
      ];
    }

    const isSameCity =
      input.originCity.toLocaleLowerCase('tr-TR') === input.destinationCity.toLocaleLowerCase('tr-TR');
    const desi = this.pkgDesi(input.pkg);
    const packageCount = input.packageCount ?? 1;

    let amount = (pricing.baseRateMinor ?? 0) + (pricing.perDesiMinor ?? 0) * desi;

    if (isSameCity && pricing.sameCityDiscount !== undefined) {
      amount = amount * (1 - pricing.sameCityDiscount);
    }
    if (packageCount > 1) amount = amount * packageCount;

    if (input.metadata?.['cashOnDelivery'] === true && pricing.codExtraFeeMinor) {
      amount += pricing.codExtraFeeMinor;
    }
    amount = Math.max(0, Math.round(amount));

    const standard: ShippingRate = {
      provider: this.code,
      amountMinor: amount,
      currency: 'TRY',
      estimatedDays: pricing.estimatedDays ?? 2,
      serviceName: 'MNG Standart',
      serviceCode: 'MNG_STD',
      metadata: { desi, packageCount, sameCity: isSameCity },
    };

    // Express (1 gün ek + %50 ücret)
    const express: ShippingRate = {
      provider: this.code,
      amountMinor: Math.round(amount * 1.5),
      currency: 'TRY',
      estimatedDays: 1,
      serviceName: 'MNG Hızlı',
      serviceCode: 'MNG_EXP',
      metadata: { desi, express: true },
    };

    return [standard, express];
  }

  /** Gönderi oluştur — `POST /api/v2/shipments`. */
  async createShipment(input: ShipmentInput): Promise<Shipment> {
    const tc = this.getTenantConfig(input.tenantId);

    const payload = {
      reference: input.orderId,
      receiver: {
        name: input.recipient.fullName,
        phone: input.recipient.phone,
        email: input.recipient.email,
        address: input.recipient.address,
        city: input.recipient.city,
        district: input.recipient.district,
        postalCode: input.recipient.postalCode,
        country: input.recipient.country ?? 'Turkey',
      },
      package: {
        weightGrams: input.pkg.weightGrams,
        desi: this.pkgDesi(input.pkg),
        widthCm: input.pkg.widthCm,
        heightCm: input.pkg.heightCm,
        lengthCm: input.pkg.lengthCm,
        count: input.packageCount ?? 1,
      },
      cashOnDeliveryMinor: input.cashOnDeliveryMinor ?? 0,
      notes: input.notes,
      customerCode: (tc.cfg.extras?.['customerCode'] as string | undefined) ?? '',
    };

    const raw = await this.authedPost<MngShipmentResponse>(
      input.tenantId,
      MNG_SHIPMENTS_PATH,
      payload,
    );

    if (!raw.trackingNumber) {
      throw new Error(raw.message ?? 'MNG gönderi oluşturma başarısız');
    }

    return {
      provider: this.code,
      trackingNumber: raw.trackingNumber,
      barcodeUrl: `https://www.mngkargo.com.tr/barcode/${raw.trackingNumber}`,
      estimatedDelivery: raw.estimatedDelivery ?? this.estimateDelivery(2),
      raw,
    };
  }

  /** Kargo takip — `GET /api/v2/tracking/{trackingNumber}`. */
  async trackShipment(trackingNumber: string): Promise<TrackingInfo> {
    const tenantId = this.firstTenantId();
    const raw = await this.authedGet<MngTrackingResponse>(
      tenantId,
      `${MNG_TRACKING_PATH_PREFIX}/${encodeURIComponent(trackingNumber)}`,
    );

    const status = this.mapMngStatus(raw.status);
    const events = (raw.events ?? []).map((e) => ({
      timestamp: e.timestamp ?? new Date().toISOString(),
      location: e.location,
      status: this.mapMngStatus(e.status),
      description: e.description,
    }));

    return {
      trackingNumber: raw.trackingNumber ?? trackingNumber,
      status,
      events,
      estimatedDelivery: raw.estimatedDelivery,
      raw,
    };
  }

  /** Gönderi iptali — `DELETE /api/v2/shipments/{trackingNumber}`. */
  async cancelShipment(trackingNumber: string): Promise<void> {
    const tenantId = this.firstTenantId();
    try {
      const raw = await this.authedDelete<MngCancelResponse>(
        tenantId,
        `${MNG_SHIPMENTS_PATH}/${encodeURIComponent(trackingNumber)}`,
      );
      if (raw.success === false) {
        throw new Error(raw.message ?? 'MNG iptal başarısız');
      }
    } catch (err) {
      this.logger?.error({ err, trackingNumber }, 'MNG cancelShipment hatası');
      throw new Error(
        `MNG gönderi iptali başarısız: ${err instanceof Error ? err.message : 'bilinmeyen'}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Dahili yardımcılar
  // -------------------------------------------------------------------------

  /** İlk tenant kimliğini getir (track/cancel için). */
  private firstTenantId(): string {
    const first = this.tenantConfigs.keys().next();
    if (first.done) throw new Error('MNG sağlayıcısı için hiç tenant başlatılmamış');
    return first.value;
  }

  /** MNG durum → standart kargo durumu eşlemesi. */
  private mapMngStatus(rawStatus: string | undefined): string {
    if (!rawStatus) return 'unknown';
    const upper = rawStatus.toUpperCase();
    const map: Record<string, string> = {
      CREATED: 'created',
      PICKED_UP: 'in_transit',
      IN_TRANSIT: 'in_transit',
      AT_BRANCH: 'at_branch',
      OUT_FOR_DELIVERY: 'out_for_delivery',
      DELIVERED: 'delivered',
      RETURNED: 'returned',
      CANCELLED: 'cancelled',
    };
    return map[upper] ?? rawStatus.toLowerCase();
  }

  /** Tahmini teslim tarihi. */
  private estimateDelivery(daysFromNow: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString();
  }
}

// ---------------------------------------------------------------------------
// Dışa açık yardımcılar
// ---------------------------------------------------------------------------

/** OAuth2 token al (test/dışarıdan kullanım için). */
export async function fetchMngAccessToken(
  clientId: string,
  clientSecret: string,
  baseUrl = MNG_DEFAULT_BASE_URL,
  fetcher: Fetcher = defaultFetcher,
): Promise<MngOAuthToken> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();
  const res = await fetcher(`${baseUrl}${MNG_OAUTH_TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const parsed = JSON.parse(res.text) as { access_token?: string; token_type?: string; expires_in?: number };
  return {
    access_token: parsed.access_token ?? '',
    token_type: parsed.token_type ?? 'Bearer',
    expires_in: parsed.expires_in ?? TOKEN_TTL_SECONDS,
    cachedAt: Math.floor(Date.now() / 1000),
  };
}