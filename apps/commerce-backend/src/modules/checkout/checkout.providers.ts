/**
 * Checkout modülü için ortak provider kayıtları.
 *
 * Gerçek adaptörler (`@eticart/payment-adapters` ve `@eticart/shipping-adapters`)
 * tenant başına secret ile yapılandırılır. Bu modül, tek bir global
 * `PaymentProviderRegistry` ve `ShippingProviderRegistry` örneği sağlar;
 * ileride tenant başına init() çağrısı yapılacak (Faz 10).
 */

import { Provider } from '@nestjs/common';
import {
  PaymentProviderRegistry,
  CashOnDeliveryProvider,
  ManualBankTransferProvider,
  type PaymentProvider,
  type PaymentProviderCode,
} from '@eticart/payment-adapters';
import {
  ShippingProviderRegistry,
  ManualShippingProvider,
  type ShippingProvider,
  type ShippingProviderCode,
} from '@eticart/shipping-adapters';

export const PAYMENT_REGISTRY_TOKEN = Symbol.for(
  '@eticart/commerce-backend/PAYMENT_REGISTRY',
);
export const SHIPPING_REGISTRY_TOKEN = Symbol.for(
  '@eticart/commerce-backend/SHIPPING_REGISTRY',
);

/**
 * Ödeme sağlayıcı registry'sini üretir.
 * Varsayılan: `cash_on_delivery` ve `manual_bank_transfer` provider'ları
 * kayıtlı; iyzico/paytr/param için tenant başına init() Faz 10'da.
 */
function buildPaymentRegistry(): PaymentProviderRegistry {
  const registry = new PaymentProviderRegistry();
  const cash: PaymentProvider = new CashOnDeliveryProvider();
  const manual: PaymentProvider = new ManualBankTransferProvider();
  registry.register(cash);
  registry.register(manual);
  // Not: iyzico init() sırasında apiSecret gerekir; tenant bazlı kurulum
  // ConfigService + PaymentProviderConfig tablosundan çekilecek (Faz 10).
  return registry;
}

/** Kargo sağlayıcı registry'si (manual provider varsayılan). */
function buildShippingRegistry(): ShippingProviderRegistry {
  const registry = new ShippingProviderRegistry();
  const manual: ShippingProvider = new ManualShippingProvider();
  registry.register(manual);
  return registry;
}

export const paymentRegistryProvider: Provider = {
  provide: PAYMENT_REGISTRY_TOKEN,
  useFactory: (): PaymentProviderRegistry => buildPaymentRegistry(),
};

export const shippingRegistryProvider: Provider = {
  provide: SHIPPING_REGISTRY_TOKEN,
  useFactory: (): ShippingProviderRegistry => buildShippingRegistry(),
};

/** Tenant çözümleyici yardımcıları (kullanılan provider kodları için). */
export const SUPPORTED_PAYMENT_PROVIDERS: PaymentProviderCode[] = [
  'cash_on_delivery',
  'manual_bank_transfer',
  'iyzico',
  'paytr',
  'param',
];

export const SUPPORTED_SHIPPING_PROVIDERS: ShippingProviderCode[] = [
  'manual',
  'yurtici',
  'aras',
  'mng',
  'surat',
];