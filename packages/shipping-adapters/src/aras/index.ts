/**
 * Aras Kargo sağlayıcısı — PLACEHOLDER.
 */

import type {
  RateInput,
  Shipment,
  ShipmentInput,
  ShippingProvider,
  ShippingProviderCode,
  ShippingProviderConfig,
  ShippingRate,
  TrackingInfo,
} from '../index.js';

export class ArasProvider implements ShippingProvider {
  public readonly code: ShippingProviderCode = 'aras';

  async init(_config: ShippingProviderConfig): Promise<void> {
    throw new Error('Aras Kargo adaptörü henüz implemente edilmedi (Faz 8+)');
  }

  async getRates(_input: RateInput): Promise<ShippingRate[]> {
    throw new Error('Aras Kargo adaptörü henüz implemente edilmedi (Faz 8+)');
  }

  async createShipment(_input: ShipmentInput): Promise<Shipment> {
    throw new Error('Aras Kargo adaptörü henüz implemente edilmedi (Faz 8+)');
  }

  async trackShipment(_trackingNumber: string): Promise<TrackingInfo> {
    throw new Error('Aras Kargo adaptörü henüz implemente edilmedi (Faz 8+)');
  }

  async cancelShipment(_trackingNumber: string): Promise<void> {
    throw new Error('Aras Kargo adaptörü henüz implemente edilmedi (Faz 8+)');
  }
}