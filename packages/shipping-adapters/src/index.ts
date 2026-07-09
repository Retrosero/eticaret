/**
 * @eticart/shipping-adapters
 *
 * Kargo sağlayıcı adaptörleri için ortak arayüz.
 * Faz 6 kapsamında: Manuel Kargo (fiyat kuralları); Yurtiçi, Aras, MNG, Sürat placeholder.
 */

import type { Money } from '@eticart/shared-types';

// ---------------------------------------------------------------------------
// Sağlayıcı kodları
// ---------------------------------------------------------------------------

/** Kargo sağlayıcı kodu. */
export type ShippingProviderCode =
  | 'manual'
  | 'yurtici'
  | 'aras'
  | 'mng'
  | 'surat'
  | 'ptt'
  | 'ups'
  | 'dhl';

/** Para birimi. */
export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';

// ---------------------------------------------------------------------------
// İstek / Yanıt tipleri
// ---------------------------------------------------------------------------

/** Paket (boyut/ağırlık). */
export interface PackageDimensions {
  /** Ağırlık (gram). */
  weightGrams: number;
  /** Desi (hacimsel ağırlık). */
  desi: number;
  /** En x boy x yükseklik (cm) — opsiyonel. */
  widthCm?: number;
  heightCm?: number;
  lengthCm?: number;
}

/** Fiyat isteği. */
export interface RateInput {
  /** Tenant kimliği. */
  tenantId: string;
  /** Çıkış şehri (depotsa kargo başlangıç noktası). */
  originCity: string;
  /** Çıkış ilçesi. */
  originDistrict?: string;
  /** Varış şehri. */
  destinationCity: string;
  /** Varış ilçesi. */
  destinationDistrict?: string;
  /** Varış posta kodu (opsiyonel, daha keskin eşleme için). */
  destinationPostalCode?: string;
  /** Paket bilgisi. */
  pkg: PackageDimensions;
  /** Paket sayısı (çoklu paket). */
  packageCount?: number;
  /** Sipariş tutarı (kuruş) — ücretsiz kargo limiti için. */
  orderTotalMinor?: number;
  /** Ek metadata (örn. COD ek ücreti). */
  metadata?: Record<string, unknown>;
}

/** Fiyat teklifi. */
export interface ShippingRate {
  /** Sağlayıcı kodu. */
  provider: ShippingProviderCode;
  /** Fiyat (kuruş). */
  amountMinor: number;
  /** Para birimi. */
  currency: Currency;
  /** Tahmini teslim süresi (gün). */
  estimatedDays: number;
  /** Hizmet adı (örn. "Standart", "Hızlı"). */
  serviceName: string;
  /** Hizmet kodu (örn. "STD", "EXPRESS"). */
  serviceCode: string;
  /** Ek metadata. */
  metadata?: Record<string, unknown>;
}

/** Gönderi oluşturma girdisi. */
export interface ShipmentInput {
  tenantId: string;
  orderId: string;
  referenceCode?: string;
  recipient: ShippingRecipient;
  pkg: PackageDimensions;
  packageCount?: number;
  /** Tahsilat tutarı (kapıda ödeme için, kuruş). */
  cashOnDeliveryMinor?: number;
  /** Teslimat notu. */
  notes?: string;
}

export interface ShippingRecipient {
  fullName: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  district?: string;
  postalCode?: string;
  country?: string;
}

/** Oluşturulan gönderi. */
export interface Shipment {
  provider: ShippingProviderCode;
  trackingNumber: string;
  /** Barkod URL'i. */
  barcodeUrl?: string;
  /** Tahmini teslim tarihi. */
  estimatedDelivery?: string;
  raw?: unknown;
}

/** Kargo takip bilgisi. */
export interface TrackingInfo {
  trackingNumber: string;
  status: string;
  /** Olay geçmişi (yeni → eski). */
  events: ReadonlyArray<TrackingEvent>;
  estimatedDelivery?: string;
  raw?: unknown;
}

export interface TrackingEvent {
  timestamp: string;
  location?: string;
  status: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Sağlayıcı sözleşmesi
// ---------------------------------------------------------------------------

/** Kargo sağlayıcı sözleşmesi. */
export interface ShippingProvider {
  readonly code: ShippingProviderCode;
  /** Tenant başına yapılandırma (API anahtarı, vs.). */
  init(config: ShippingProviderConfig): Promise<void>;
  /** Fiyat teklifi al. */
  getRates(input: RateInput): Promise<ShippingRate[]>;
  /** Gönderi oluştur. */
  createShipment(input: ShipmentInput): Promise<Shipment>;
  /** Kargo takip. */
  trackShipment(trackingNumber: string): Promise<TrackingInfo>;
  /** Gönderiyi iptal et. */
  cancelShipment(trackingNumber: string): Promise<void>;
}

export interface ShippingProviderConfig {
  tenantId: string;
  /** API anahtarı (placeholder'lar için opsiyonel). */
  apiKey?: string;
  /** API secret. */
  apiSecret?: string;
  /** Sandbox ortamı mı? */
  sandbox?: boolean;
  /** Manuel sağlayıcı için fiyat kuralları. */
  pricing?: ManualPricingConfig;
  /** Tenant başlangıç adresi. */
  origin?: {
    city: string;
    district?: string;
    postalCode?: string;
  };
  /** Sağlayıcıya özel ekstra parametreler (örn. SOAP endpoint override, OAuth2 müşteri kodu). */
  extras?: Record<string, unknown>;
}

/** Manuel kargo için fiyat kuralları. */
export interface ManualPricingConfig {
  /** Sabit fiyat (kuruş). */
  flatRateMinor?: number;
  /** Ücretsiz kargo limiti (kuruş) — üzerinde ücretsiz. */
  freeShippingThresholdMinor?: number;
  /** Desi başına ücret (kuruş/dési). */
  perDesiMinor?: number;
  /** Ağırlık başına ücret (kuruş/kg). */
  perKgMinor?: number;
  /** Bölgesel ek ücret (il bazında, kuruş). */
  regionalSurcharges?: Record<string, number>;
  /** Hizmet seçenekleri. */
  services?: ReadonlyArray<ManualServiceRule>;
}

export interface ManualServiceRule {
  code: string;
  name: string;
  estimatedDays: number;
  /** Bu hizmet için fiyatlandırma (yoksa ana config kullanılır). */
  pricing?: ManualPricingConfig;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Kargo sağlayıcı registry. */
export class ShippingProviderRegistry {
  private readonly providers = new Map<ShippingProviderCode, ShippingProvider>();

  register(provider: ShippingProvider): void {
    if (this.providers.has(provider.code)) {
      throw new Error(`Kargo sağlayıcısı zaten kayıtlı: ${provider.code}`);
    }
    this.providers.set(provider.code, provider);
  }

  get(code: ShippingProviderCode): ShippingProvider | undefined {
    return this.providers.get(code);
  }

  list(): ShippingProviderCode[] {
    return Array.from(this.providers.keys());
  }
}

// ---------------------------------------------------------------------------
// Barrel
// ---------------------------------------------------------------------------

export { ManualShippingProvider } from './manual/index.js';
export { YurticiProvider } from './yurtici/index.js';
export { ArasProvider } from './aras/index.js';
export { MngProvider } from './mng/index.js';
export { SuratProvider } from './surat/index.js';

// Para tipi tekrarı (shared-types ile senkron — ileride shared-types'a taşınabilir)
export type { Money };