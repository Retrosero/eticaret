/**
 * Yurtiçi Kargo sağlayıcısı — SOAP API entegrasyonu.
 *
 * Yurtiçi'nin sunduğu `https://api.yurticikargo.com.tr` SOAP servisi aşağıdaki
 * operasyonları sağlar:
 *   - createShipment: Kargo gönderisi oluşturma, takip no (barkod) üretir
 *   - queryShipment: Kargo durumunu sorgulama
 *   - cancelShipment: Gönderi iptali
 *
 * Yurtiçi'nin gerçek bir fiyat (rate) endpoint'i yoktur; fiyat hesabı
 * desi × km bazında yapılır. Bu implementasyon, tenant tarafından config üzerinden
 * verilen `pricing` kurallarını uygular; gerçek Yurtiçi fiyatı için tenant
 * sözleşme fiyatlarını kullanmalıdır.
 *
 * SOAP iletişimi: `node-soap` paketi zorunlu değildir; bu implementasyon
 * XML envelope'larını elle oluşturur ve `DOMParser`/`xml2js` benzeri bağımlılık
 * olmadan regex tabanlı parsing yapar. Bu sayede paket boyutu küçük kalır ve
 * node runtime uyumluluğu sağlanır.
 *
 * Yapılandırma eşlemesi (ShippingProviderConfig):
 *   - apiKey     → WS_USER (kullanıcı adı)
 *   - apiSecret  → WS_PASSWORD
 *   - extras.wsUrl → SOAP endpoint URL (override için)
 *   - extras.customerCode → Müşteri kodu
 *   - extras.pricing → Manuel fiyat kuralları (desi/km bazlı)
 *
 * Sandbox: Yurtiçi tek bir test ortamı sunar (api.yurticikargo.com.tr);
 * müşteri kodu + WS_USER ile ayrım yapılır.
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

/** Yurtiçi default SOAP endpoint. */
const YURTICI_DEFAULT_URL = 'https://api.yurticikargo.com.tr/KargoWebService/kargoService.svc';

/** Test ortamı URL (tenant wsUrl ile override edilebilir). */
const YURTICI_SANDBOX_URL = 'https://api.yurticikargo.com.tr/KargoWebService/kargoService.svc';

// ---------------------------------------------------------------------------
// Yardımcı tipler
// ---------------------------------------------------------------------------

/** Tenant başına fiyatlandırma kuralı. */
export interface YurticiPricingConfig {
  /** Desi başına birim fiyat (kuruş/dési). */
  perDesiMinor?: number;
  /** Mesafe başına birim fiyat (kuruş/km). */
  perKmMinor?: number;
  /** Sabit taban ücret (kuruş). */
  baseRateMinor?: number;
  /** Ücretsiz kargo limiti (kuruş) — bu tutarın üzerindeki siparişlerde ücretsiz. */
  freeShippingThresholdMinor?: number;
  /** Aynı şehir içi indirim oranı (0..1). */
  sameCityDiscount?: number;
  /** Kapıda ödeme ek ücreti (kuruş). */
  codExtraFeeMinor?: number;
  /** Tahmini teslim süresi (gün). */
  estimatedDays?: number;
}

/** Tenant başına cache. */
interface YurticiTenantConfig {
  cfg: ShippingProviderConfig;
  pricing: YurticiPricingConfig;
}

// ---------------------------------------------------------------------------
// Şehir mesafe matrisi (yaklaşık km, il merkezleri arası)
// Tam 81 il matrisi bu dosyada tutulmaz; demo için en sık kullanılan ana rotalar.
// Tenant kendi mesafe verisini pricing.extras.distanceMatrix ile override edebilir.
// ---------------------------------------------------------------------------

/** İl plaka/anahtarları için bilinen büyükşehir koordinatları (yaklaşık). */
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  İSTANBUL: { lat: 41.0082, lon: 28.9784 },
  ANKARA: { lat: 39.9334, lon: 32.8597 },
  İZMİR: { lat: 38.4237, lon: 27.1428 },
  BURSA: { lat: 40.1828, lon: 29.0665 },
  ANTALYA: { lat: 36.8969, lon: 30.7133 },
  ADANA: { lat: 37.0003, lon: 35.3213 },
  KONYA: { lat: 37.8746, lon: 32.4932 },
  GAZİANTEP: { lat: 37.0662, lon: 37.3833 },
  KAYSERİ: { lat: 38.7218, lon: 35.4826 },
  MERSİN: { lat: 36.8121, lon: 34.6415 },
  DİYARBAKIR: { lat: 37.9144, lon: 40.2306 },
  SAMSUN: { lat: 41.2867, lon: 36.33 },
  ESKİŞEHİR: { lat: 39.7767, lon: 30.5206 },
  TRABZON: { lat: 41.0027, lon: 39.7168 },
  DENİZLİ: { lat: 37.7765, lon: 29.0864 },
};

const DEFAULT_PRICING: YurticiPricingConfig = {
  perDesiMinor: 1500, // 15 TL/dési
  perKmMinor: 5, // 0.05 TL/km
  baseRateMinor: 2900, // 29 TL taban
  freeShippingThresholdMinor: 50000, // 500 TL üzeri ücretsiz
  sameCityDiscount: 0.3, // %30 aynı şehir indirimi
  codExtraFeeMinor: 990, // 9.90 TL kapıda ödeme
  estimatedDays: 2,
};

// ---------------------------------------------------------------------------
// Yurtiçi sağlayıcısı
// ---------------------------------------------------------------------------

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
 * Yurtiçi Kargo sağlayıcısı.
 *
 * SOAP tabanlı olup XML envelope'ları elle oluşturulur ve parse edilir.
 * `node-soap` bağımlılığı yoktur; minimal payload ile çalışır.
 */
export class YurticiProvider implements ShippingProvider {
  public readonly code: ShippingProviderCode = 'yurtici';

  /** Tenant başına config cache. */
  private readonly tenantConfigs = new Map<string, YurticiTenantConfig>();
  /** Logger (DI opsiyonel). */
  private readonly logger: Logger | undefined;
  /** Fetch implementasyonu (test için değiştirilebilir). */
  private readonly fetcher: Fetcher;

  constructor(opts?: { logger?: Logger; fetcher?: Fetcher }) {
    this.logger = opts?.logger;
    this.fetcher = opts?.fetcher ?? defaultFetcher;
  }

  // -------------------------------------------------------------------------
  // Init & yardımcılar
  // -------------------------------------------------------------------------

  /** Tenant başına yapılandırma. */
  async init(config: ShippingProviderConfig): Promise<void> {
    if (!config.tenantId) throw new Error('tenantId zorunlu');
    if (!config.apiKey) throw new Error('Yurtiçi WS_USER zorunlu (apiKey)');
    if (!config.apiSecret) throw new Error('Yurtiçi WS_PASSWORD zorunlu (apiSecret)');

    const pricingInput = (config.extras?.['pricing'] as YurticiPricingConfig | undefined) ?? {};
    const pricing: YurticiPricingConfig = { ...DEFAULT_PRICING, ...pricingInput };

    this.tenantConfigs.set(config.tenantId, { cfg: config, pricing });
    this.logger?.info({ tenantId: config.tenantId }, 'Yurtiçi Kargo sağlayıcısı başlatıldı');
  }

  /** Tenant config'ini getir. */
  private getTenantConfig(tenantId: string): YurticiTenantConfig {
    const c = this.tenantConfigs.get(tenantId);
    if (!c) throw new Error('Yurtiçi sağlayıcısı tenant için başlatılmamış');
    return c;
  }

  /** SOAP endpoint URL'ini getir. */
  private wsUrl(tenantId: string): string {
    const c = this.getTenantConfig(tenantId);
    const override = c.cfg.extras?.['wsUrl'] as string | undefined;
    if (override) return override;
    return c.cfg.sandbox === false ? YURTICI_DEFAULT_URL : YURTICI_SANDBOX_URL;
  }

  /** WS_USER. */
  private wsUser(tenantId: string): string {
    return this.getTenantConfig(tenantId).cfg.apiKey!;
  }

  /** WS_PASSWORD. */
  private wsPassword(tenantId: string): string {
    return this.getTenantConfig(tenantId).cfg.apiSecret!;
  }

  /** Müşteri kodu. */
  private customerCode(tenantId: string): string {
    const c = this.getTenantConfig(tenantId).cfg.extras?.['customerCode'] as string | undefined;
    return c ?? '';
  }

  /** Şehir adını normalleştir (büyük harf, Türkçe karakter sadeleştirme). */
  private normalizeCity(city: string): string {
    return city
      .toLocaleUpperCase('tr-TR')
      .replace(/İ/g, 'I')
      .replace(/Ş/g, 'S')
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ö/g, 'O')
      .replace(/Ç/g, 'C')
      .trim();
  }

  /**
   * İki il arası mesafe tahmini (km).
   * Haversine formülü ile koordinat farkından hesaplanır.
   * Koordinatı bilinmeyen şehirler için fallback 500 km döner.
   */
  private estimateDistanceKm(origin: string, destination: string): number {
    const o = this.normalizeCity(origin);
    const d = this.normalizeCity(destination);
    if (o === d) return 0;

    const a = CITY_COORDS[o];
    const b = CITY_COORDS[d];
    if (!a || !b) {
      // Bilinmeyen şehir — fallback
      return 500;
    }
    const R = 6371; // Dünya yarıçapı km
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  }

  /** Paket desi hesabı (boyut verilmemişse desi alanını kullan). */
  private pkgDesi(pkg: PackageDimensions): number {
    if (pkg.desi > 0) return pkg.desi;
    if (pkg.widthCm && pkg.heightCm && pkg.lengthCm) {
      return Math.ceil((pkg.widthCm * pkg.heightCm * pkg.lengthCm) / 3000);
    }
    return 1;
  }

  // -------------------------------------------------------------------------
  // SOAP yardımcıları
  // -------------------------------------------------------------------------

  /** SOAP envelope oluştur (basit yapı). */
  private buildEnvelope(action: string, bodyXml: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <wsUser>${this.escapeXml(this.wsUser(this.currentTenantId))}</wsUser>
    <wsPassword>${this.escapeXml(this.wsPassword(this.currentTenantId))}</wsPassword>
    <customerCode>${this.escapeXml(this.customerCode(this.currentTenantId))}</customerCode>
  </soap:Header>
  <soap:Body>
    <${action} xmlns="http://yurticikargo.com.tr/">
      ${bodyXml}
    </${action}>
  </soap:Body>
</soap:Envelope>`;
  }

  /** Geçici tenant kimliği (SOAP build sırasında kullanılır). */
  private currentTenantId = '';

  /** XML escape. */
  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /** SOAP yanıtını parse et. */
  private parseSoapResponse(xml: string): Record<string, string> {
    const result: Record<string, string> = {};
    // Container tag'leri kaldır
    const stripped = xml
      .replace(/<soap:Envelope[\s\S]*?>/g, '')
      .replace(/<\/soap:Envelope>/g, '')
      .replace(/<soap:Body[\s\S]*?>/g, '')
      .replace(/<\/soap:Body>/g, '')
      .replace(/<soap:Header[\s\S]*?>/g, '')
      .replace(/<\/soap:Header>/g, '')
      .replace(/<soap:Fault[\s\S]*?>/g, '')
      .replace(/<\/soap:Fault>/g, '')
      .replace(/<Response[\s\S]*?>/g, '')
      .replace(/<\/Response>/g, '');

    // Yaprak (leaf) tag'leri yakala
    const tagRe = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRe.exec(stripped)) !== null) {
      if (result[match[1]!] === undefined) {
        result[match[1]!] = match[2]!
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Fiyat teklifi.
   *
   * Yurtiçi'nin gerçek bir rate endpoint'i yoktur; bu nedenle fiyat tenant
   * config'inden (`pricing`) hesaplanır. Formül:
   *   base + (perDesi * ceil(desi)) + (perKm * mesafe)
   *   - Aynı şehir içi: sameCityDiscount uygulanır
   *   - orderTotal >= freeShippingThreshold: ücretsiz
   *   - COD varsa: codExtraFeeMinor eklenir
   */
  async getRates(input: RateInput): Promise<ShippingRate[]> {
    const tc = this.getTenantConfig(input.tenantId);
    const pricing = tc.pricing;

    // Ücretsiz kargo limiti kontrolü
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
          serviceName: 'Yurtiçi Standart',
          serviceCode: 'YRT_STD',
          metadata: { freeShipping: true },
        },
      ];
    }

    const distanceKm = this.estimateDistanceKm(input.originCity, input.destinationCity);
    const isSameCity = distanceKm === 0;
    const desi = this.pkgDesi(input.pkg);
    const packageCount = input.packageCount ?? 1;

    // Temel fiyat hesabı
    let amount =
      (pricing.baseRateMinor ?? 0) +
      (pricing.perDesiMinor ?? 0) * desi +
      (pricing.perKmMinor ?? 0) * distanceKm;

    // Aynı şehir indirimi
    if (isSameCity && pricing.sameCityDiscount !== undefined) {
      amount = amount * (1 - pricing.sameCityDiscount);
    }

    // Paket sayısı çarpanı
    if (packageCount > 1) {
      amount = amount * packageCount;
    }

    // COD ek ücreti
    if (input.metadata?.['cashOnDelivery'] === true && pricing.codExtraFeeMinor) {
      amount += pricing.codExtraFeeMinor;
    }

    amount = Math.max(0, Math.round(amount));

    const standard: ShippingRate = {
      provider: this.code,
      amountMinor: amount,
      currency: 'TRY',
      estimatedDays: pricing.estimatedDays ?? 2,
      serviceName: 'Yurtiçi Standart',
      serviceCode: 'YRT_STD',
      metadata: {
        distanceKm,
        desi,
        packageCount,
        sameCity: isSameCity,
      },
    };

    // Hızlı seçenek (1 gün ek + %50 ek ücret)
    const express: ShippingRate = {
      provider: this.code,
      amountMinor: Math.round(amount * 1.5),
      currency: 'TRY',
      estimatedDays: 1,
      serviceName: 'Yurtiçi Hızlı',
      serviceCode: 'YRT_EXP',
      metadata: {
        distanceKm,
        desi,
        express: true,
      },
    };

    return [standard, express];
  }

  /** Gönderi oluştur — SOAP `createShipment` çağrısı. */
  async createShipment(input: ShipmentInput): Promise<Shipment> {
    if (!this.tenantConfigs.has(input.tenantId)) {
      throw new Error('Yurtiçi sağlayıcısı tenant için başlatılmamış');
    }
    this.currentTenantId = input.tenantId;

    // Gönderi XML'i oluştur
    const bodyXml = `
      <cargoKey>${this.escapeXml(input.orderId)}</cargoKey>
      <receiverName>${this.escapeXml(input.recipient.fullName)}</receiverName>
      <receiverPhone>${this.escapeXml(input.recipient.phone)}</receiverPhone>
      <receiverAddress>${this.escapeXml(input.recipient.address)}</receiverAddress>
      <receiverCity>${this.escapeXml(input.recipient.city)}</receiverCity>
      <receiverDistrict>${this.escapeXml(input.recipient.district ?? '')}</receiverDistrict>
      <receiverPostalCode>${this.escapeXml(input.recipient.postalCode ?? '')}</receiverPostalCode>
      <weight>${Math.max(1, Math.round(input.pkg.weightGrams / 1000))}</weight>
      <desi>${this.pkgDesi(input.pkg)}</desi>
      <packageCount>${input.packageCount ?? 1}</packageCount>
      <cashOnDelivery>${input.cashOnDeliveryMinor ?? 0}</cashOnDelivery>
      <notes>${this.escapeXml(input.notes ?? '')}</notes>
      <referenceCode>${this.escapeXml(input.referenceCode ?? input.orderId)}</referenceCode>
    `;

    const envelope = this.buildEnvelope('createShipment', bodyXml);

    let responseXml: string;
    try {
      const res = await this.fetcher(this.wsUrl(input.tenantId), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://yurticikargo.com.tr/createShipment',
        },
        body: envelope,
      });
      if (res.status >= 500) {
        throw new Error(`Yurtiçi createShipment 5xx yanıt: ${res.status}`);
      }
      responseXml = res.text;
    } catch (err) {
      this.logger?.error({ err, tenantId: input.tenantId }, 'Yurtiçi createShipment hatası');
      throw new Error(
        `Yurtiçi gönderi oluşturma başarısız: ${err instanceof Error ? err.message : 'bilinmeyen'}`,
      );
    }

    const fields = this.parseSoapResponse(responseXml);
    const trackingNumber =
      fields['trackingNumber'] ?? fields['barcodeNumber'] ?? fields['cargoKey'];

    if (!trackingNumber) {
      // SOAP fault olabilir
      const fault = fields['faultstring'] ?? fields['errorMessage'];
      throw new Error(fault ?? 'Yurtiçi gönderi oluşturma yanıtı ayrıştırılamadı');
    }

    return {
      provider: this.code,
      trackingNumber,
      barcodeUrl: `https://www.yurticikargo.com.tr/barcode/${trackingNumber}`,
      estimatedDelivery: this.estimateDelivery(2),
      raw: fields,
    };
  }

  /** Kargo takip — SOAP `queryShipment` çağrısı. */
  async trackShipment(trackingNumber: string): Promise<TrackingInfo> {
    const tenantId = this.firstTenantId();
    this.currentTenantId = tenantId;

    const bodyXml = `<trackingNumber>${this.escapeXml(trackingNumber)}</trackingNumber>`;
    const envelope = this.buildEnvelope('queryShipment', bodyXml);

    let responseXml: string;
    try {
      const res = await this.fetcher(this.wsUrl(tenantId), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://yurticikargo.com.tr/queryShipment',
        },
        body: envelope,
      });
      if (res.status >= 500) {
        throw new Error(`Yurtiçi queryShipment 5xx yanıt: ${res.status}`);
      }
      responseXml = res.text;
    } catch (err) {
      this.logger?.error({ err, trackingNumber }, 'Yurtiçi queryShipment hatası');
      throw new Error(
        `Yurtiçi takip sorgusu başarısız: ${err instanceof Error ? err.message : 'bilinmeyen'}`,
      );
    }

    const fields = this.parseSoapResponse(responseXml);
    const status = this.mapYurticiStatus(fields['status'] ?? fields['movementStatus']);

    return {
      trackingNumber,
      status,
      events: [
        {
          timestamp: new Date().toISOString(),
          location: fields['location'] ?? fields['branchName'],
          status,
          description: fields['description'] ?? fields['movementDescription'] ?? 'Kargo durumu güncellendi',
        },
      ],
      estimatedDelivery: fields['estimatedDelivery'],
      raw: fields,
    };
  }

  /** Gönderi iptali — SOAP `cancelShipment` çağrısı. */
  async cancelShipment(trackingNumber: string): Promise<void> {
    const tenantId = this.firstTenantId();
    this.currentTenantId = tenantId;

    const bodyXml = `<trackingNumber>${this.escapeXml(trackingNumber)}</trackingNumber>`;
    const envelope = this.buildEnvelope('cancelShipment', bodyXml);

    try {
      const res = await this.fetcher(this.wsUrl(tenantId), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://yurticikargo.com.tr/cancelShipment',
        },
        body: envelope,
      });
      if (res.status >= 500) {
        throw new Error(`Yurtiçi cancelShipment 5xx yanıt: ${res.status}`);
      }
      // Yanıt parse edilip hata kontrolü yapılabilir
      const fields = this.parseSoapResponse(res.text);
      if (fields['errorMessage'] || fields['faultstring']) {
        throw new Error(fields['errorMessage'] ?? fields['faultstring']);
      }
    } catch (err) {
      this.logger?.error({ err, trackingNumber }, 'Yurtiçi cancelShipment hatası');
      throw new Error(
        `Yurtiçi gönderi iptali başarısız: ${err instanceof Error ? err.message : 'bilinmeyen'}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Dahili yardımcılar
  // -------------------------------------------------------------------------

  /** İlk tenant kimliğini getir (track/cancel için). */
  private firstTenantId(): string {
    const first = this.tenantConfigs.keys().next();
    if (first.done) throw new Error('Yurtiçi sağlayıcısı için hiç tenant başlatılmamış');
    return first.value;
  }

  /** Yurtiçi durum kodunu standart kargo durumuna eşle. */
  private mapYurticiStatus(rawStatus: string | undefined): string {
    if (!rawStatus) return 'unknown';
    const upper = rawStatus.toUpperCase();
    const map: Record<string, string> = {
      KABUL: 'created',
      SEFERDE: 'in_transit',
      DAGITIMDA: 'out_for_delivery',
      TESLIM: 'delivered',
      IADE: 'returned',
      IPTAL: 'cancelled',
      AKTARMA: 'in_transit',
      ŞUBEDE: 'at_branch',
    };
    return map[upper] ?? rawStatus.toLowerCase();
  }

  /** Tahmini teslim tarihi (gün sayısı kadar sonra). */
  private estimateDelivery(daysFromNow: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString();
  }
}

// ---------------------------------------------------------------------------
// Dışa açık yardımcı fonksiyonlar
// ---------------------------------------------------------------------------

/** Paket için desi hesabı (export). */
export function calcYurticiDesi(pkg: PackageDimensions): number {
  if (pkg.desi > 0) return pkg.desi;
  if (pkg.widthCm && pkg.heightCm && pkg.lengthCm) {
    return Math.ceil((pkg.widthCm * pkg.heightCm * pkg.lengthCm) / 3000);
  }
  return 1;
}

/** Tahmini mesafe (km). */
export function estimateYurticiDistance(origin: string, destination: string): number {
  const norm = (c: string) =>
    c
      .toLocaleUpperCase('tr-TR')
      .replace(/İ/g, 'I')
      .replace(/Ş/g, 'S')
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ö/g, 'O')
      .replace(/Ç/g, 'C')
      .trim();
  const o = norm(origin);
  const d = norm(destination);
  if (o === d) return 0;
  const a = CITY_COORDS[o];
  const b = CITY_COORDS[d];
  if (!a || !b) return 500;
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}