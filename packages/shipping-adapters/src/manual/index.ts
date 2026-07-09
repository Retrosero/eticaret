/**
 * Manuel Kargo sağlayıcısı.
 *
 * Tenant'ın kendi teslimatını yaptığı veya sözleşmeli kargo yerine
 * manuel fiyatlandırma kullanmak istediği senaryolar için.
 *
 * Fiyat kuralları:
 *   - Sabit fiyat (flatRateMinor)
 *   - Desi başına ücret
 *   - Ağırlık başına ücret
 *   - Bölgesel ek ücret (il bazında)
 *   - Ücretsiz kargo limiti (X TL üzeri)
 *   - Birden fazla hizmet kuralı (Standart, Hızlı, vb.)
 */

import type {
  ManualPricingConfig,
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

const DEFAULT_SERVICE_NAME = 'Standart';
const DEFAULT_SERVICE_CODE = 'STD';

export class ManualShippingProvider implements ShippingProvider {
  public readonly code: ShippingProviderCode = 'manual';

  /** Tenant başına config cache. */
  private readonly tenantConfigs = new Map<string, ShippingProviderConfig>();

  async init(config: ShippingProviderConfig): Promise<void> {
    if (!config.tenantId) throw new Error('tenantId zorunlu');
    this.tenantConfigs.set(config.tenantId, config);
  }

  /** Fiyat teklifi. */
  async getRates(input: RateInput): Promise<ShippingRate[]> {
    const cfg = this.tenantConfigs.get(input.tenantId);
    if (!cfg) throw new Error('Kargo sağlayıcısı tenant için başlatılmamış');
    const pricing = cfg.pricing ?? {};
    const services = pricing.services ?? [this.defaultService()];

    return services.map((svc) => {
      const svcPricing: ManualPricingConfig = svc.pricing ?? pricing;
      const amount = this.computeRate(input, svcPricing, input.orderTotalMinor ?? 0);
      return {
        provider: this.code,
        amountMinor: amount,
        currency: 'TRY',
        estimatedDays: svc.estimatedDays,
        serviceName: svc.name,
        serviceCode: svc.code,
        metadata: { manual: true },
      };
    });
  }

  /** Gönderi oluştur. */
  async createShipment(input: ShipmentInput): Promise<Shipment> {
    // Manuel sağlayıcıda "gönderi" yalnızca takip numarası üretir
    const trackingNumber = this.generateTrackingNumber(input.orderId);
    return {
      provider: this.code,
      trackingNumber,
      barcodeUrl: `https://placeholder.local/barcode/${trackingNumber}.png`,
      estimatedDelivery: this.estimateDelivery(3),
      raw: { manual: true },
    };
  }

  /** Kargo takip (manuel sağlayıcı için sabit şablon). */
  async trackShipment(trackingNumber: string): Promise<TrackingInfo> {
    return {
      trackingNumber,
      status: 'in_transit',
      events: [
        {
          timestamp: new Date().toISOString(),
          status: 'in_transit',
          description: 'Kargo yolda (manuel takip)',
        },
      ],
      estimatedDelivery: this.estimateDelivery(2),
      raw: { manual: true },
    };
  }

  /** Gönderi iptali (manuel sağlayıcıda no-op). */
  async cancelShipment(trackingNumber: string): Promise<void> {
    // Manuel sağlayıcıda API iptali yok — tenant kendi sürecini yönetir
    void trackingNumber;
  }

  // -------------------------------------------------------------------------
  // Dahili yardımcılar
  // -------------------------------------------------------------------------

  /** Bir hizmet için fiyat hesapla. */
  private computeRate(
    input: RateInput,
    pricing: ManualPricingConfig,
    orderTotalMinor: number,
  ): number {
    // Ücretsiz kargo limiti kontrolü
    if (
      pricing.freeShippingThresholdMinor !== undefined &&
      orderTotalMinor >= pricing.freeShippingThresholdMinor
    ) {
      return 0;
    }

    let amount = 0;

    // Sabit fiyat
    if (pricing.flatRateMinor !== undefined) {
      amount += pricing.flatRateMinor;
    }

    // Desi başına
    if (pricing.perDesiMinor !== undefined && input.pkg.desi > 0) {
      // İlk desi dahil mi? Standart olarak ilk desi dahil kabul edelim
      const billableDesi = Math.max(0, input.pkg.desi - 1);
      amount += Math.ceil(billableDesi) * pricing.perDesiMinor;
    }

    // Ağırlık başına (kg)
    if (pricing.perKgMinor !== undefined && input.pkg.weightGrams > 0) {
      const kg = input.pkg.weightGrams / 1000;
      // İlk kg dahil
      const billableKg = Math.max(0, kg - 1);
      amount += Math.ceil(billableKg * 10) / 10 * pricing.perKgMinor;
    }

    // Bölgesel ek ücret
    const surcharge = pricing.regionalSurcharges?.[input.destinationCity];
    if (surcharge) amount += surcharge;

    return Math.max(0, Math.round(amount));
  }

  /** Varsayılan hizmet kuralı. */
  private defaultService(): {
    code: string;
    name: string;
    estimatedDays: number;
    pricing?: ManualPricingConfig;
  } {
    return {
      code: DEFAULT_SERVICE_CODE,
      name: DEFAULT_SERVICE_NAME,
      estimatedDays: 3,
    };
  }

  /** Manuel takip numarası üret. */
  private generateTrackingNumber(orderId: string): string {
    const ts = Date.now().toString(36).toUpperCase();
    const ord = orderId.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
    return `MAN-${ord}-${ts}`;
  }

  /** Teslim tarihi tahmini (gün sayısı kadar sonra). */
  private estimateDelivery(daysFromNow: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString();
  }
}

/** Yardımcı: Türk il plaka kodu normalizasyonu (kıyaslama için). */
export function normalizeCityKey(city: string): string {
  return city
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .trim();
}

/** Paket boyutlarından desi hesapla (cm). */
export function calcDesi(pkg: PackageDimensions): number {
  if (pkg.desi > 0) return pkg.desi;
  if (pkg.widthCm && pkg.heightCm && pkg.lengthCm) {
    return Math.ceil((pkg.widthCm * pkg.heightCm * pkg.lengthCm) / 3000);
  }
  return 1;
}