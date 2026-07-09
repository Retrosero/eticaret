/**
 * @eticart/payment-adapters
 *
 * Ödeme sağlayıcı adaptörleri için ortak arayüz ve somut implementasyonlar.
 * Faz 6 kapsamında: iyzico, havale/EFT, kapıda ödeme; PayTR ve Param placeholder.
 *
 * Tüm adaptörler `PaymentProvider` sözleşmesine uyar. Adaptörler
 * - tenant başına izole secret ile çalışır
 * - idempotency-key destekler
 * - webhook imza doğrulaması yapar
 * - 3D Secure akışı için yönlendirme bilgisi üretir
 */

import type { Money } from '@eticart/shared-types';

// ---------------------------------------------------------------------------
// Sağlayıcı kodları ve tipleri
// ---------------------------------------------------------------------------

/** Ödeme sağlayıcı kodu. */
export type PaymentProviderCode =
  | 'iyzico'
  | 'paytr'
  | 'param'
  | 'stripe'
  | 'manual_bank_transfer'
  | 'cash_on_delivery';

/** Ödeme durumu (PaymentIntent). */
export type PaymentIntentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'cancelled';

/** Para birimi. */
export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';

/** Ödeme yöntemi (iyzico'nun checkout form'undan). */
export type PaymentMethod =
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  | 'wallet'
  | 'cash_on_delivery';

/** Provider yapılandırması — tenant başına izole. */
export interface ProviderConfig {
  /** Tenant kimliği. */
  tenantId: string;
  /** API anahtarı. */
  apiKey: string;
  /** API gizli anahtarı. */
  apiSecret: string;
  /** Sandbox ortamı mı? */
  sandbox: boolean;
  /** Opsiyonel callback URL'i (iyzico için). */
  callbackUrl?: string;
  /** Ekstra provider parametreleri (örn. iyzico için `paymentChannels`). */
  extras?: Record<string, unknown>;
}

/** Müşteri bilgisi (ödeme için). */
export interface CustomerInfo {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string; // +90XXXXXXXXXX
  ipAddress: string;
  city: string;
  country: string;
}

/** Adres bilgisi (ödeme sağlayıcısına iletilecek). */
export interface BillingAddress {
  contactName: string;
  city: string;
  country: string;
  address: string;
  postalCode?: string;
}

/** Sepet ürün kalemi (ödeme sağlayıcısına iletilecek). */
export interface ProviderCartItem {
  id: string; // varyant veya ürün ID
  name: string;
  category: string;
  price: number; // kuruş
  quantity: number;
  itemType?: 'PHYSICAL' | 'VIRTUAL';
}

/** Ödeme başlatma girdisi. */
export interface CreatePaymentInput {
  /** Benzersiz ödeme anahtarı (idempotency). */
  idempotencyKey: string;
  /** Tenant + sipariş/sepet referansı. */
  tenantId: string;
  /** Sipariş veya sepet ID. */
  referenceId: string;
  /** Toplam tutar (kuruş). */
  amount: number;
  /** Para birimi. */
  currency: Currency;
  /** Ödeme yöntemi (varsayılan: credit_card). */
  paymentMethod?: PaymentMethod;
  /** Sepet ürün kalemleri (provider breakdown). */
  items: ProviderCartItem[];
  /** Müşteri bilgisi. */
  customer: CustomerInfo;
  /** Teslimat adresi (ödeme sağlayıcısına). */
  shippingAddress: BillingAddress;
  /** Fatura adresi. */
  billingAddress: BillingAddress;
  /** Başarılı dönüş URL'i (3DS sonrası). */
  successUrl: string;
  /** Başarısız dönüş URL'i (3DS sonrası). */
  failureUrl: string;
  /** Ek metadata. */
  metadata?: Record<string, string>;
}

/** 3DS yönlendirme bilgisi. */
export interface PaymentIntent {
  /** Provider'ın verdiği işlem kimliği (iyzico token, vb.). */
  providerReference: string;
  /** Sağlayıcı kodu. */
  provider: PaymentProviderCode;
  /** Durum. */
  status: PaymentIntentStatus;
  /** 3DS form URL'i (boş ise doğrudan tamamlanmış demektir). */
  redirectUrl?: string;
  /** Hata mesajı (başarısız intent'lerde kullanıcı dostu açıklama). */
  errorMessage?: string;
  /** Ham provider yanıtı (debug/audit). */
  raw?: unknown;
}

/** 3DS sonrası provider'dan gelen callback verisi. */
export interface CallbackData {
  /** Provider'ın token'ı (iyzico token). */
  token: string;
  /** Status (success/failure). */
  status: 'success' | 'failure';
  /** Ham provider yanıtı. */
  raw?: unknown;
}

/** Ödeme sonucu. */
export interface PaymentResult {
  providerReference: string;
  status: PaymentIntentStatus;
  /** Provider tarafında işlenmiş tutar (kuruş). */
  amount: number;
  currency: Currency;
  /** Provider'ın yanıtındaki transactionId. */
  providerTransactionId?: string;
  /** Hata kodu (başarısızsa). */
  errorCode?: string;
  /** Hata mesajı (kullanıcı dostu). */
  errorMessage?: string;
  /** Ham provider yanıtı. */
  raw?: unknown;
}

/** İade girdisi. */
export interface RefundInput {
  /** Ödeme referansı (iyzico paymentTransactionId). */
  providerReference: string;
  /** Provider transaction ID. */
  providerTransactionId?: string;
  /** İade tutarı (kuruş). */
  amount: number;
  /** Para birimi. */
  currency: Currency;
  /** İade nedeni. */
  reason?: string;
  /** Idempotency anahtarı. */
  idempotencyKey: string;
}

/** İade sonucu. */
export interface RefundResult {
  success: boolean;
  providerRefundId?: string;
  amount: number;
  currency: Currency;
  errorCode?: string;
  errorMessage?: string;
  raw?: unknown;
}

/** Webhook olayı (provider'dan gelen ham). */
export interface WebhookEvent {
  /** Provider kodu. */
  provider: PaymentProviderCode;
  /** Olay tipi (payment.success, payment.failed, vb.). */
  eventType: string;
  /** Provider'ın ödeme referansı (iyzico paymentId/token). */
  providerReference: string;
  /** Provider transaction ID (varsa). */
  providerTransactionId?: string;
  /** Tutar (kuruş). */
  amount?: number;
  /** Para birimi. */
  currency?: Currency;
  /** Durum. */
  status: PaymentIntentStatus;
  /** Ham provider yanıtı. */
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Soyut sağlayıcı sözleşmesi
// ---------------------------------------------------------------------------

/** Tüm ödeme sağlayıcılarının uyacağı sözleşme. */
export interface PaymentProvider {
  readonly code: PaymentProviderCode;
  /** Tek seferlik yapılandırma (tenant başına). */
  init(config: ProviderConfig): Promise<void>;
  /** Ödeme niyeti başlat (3DS yönlendirmesi döner). */
  createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent>;
  /** 3DS sonrası callback'i işle. */
  confirmPayment(intentId: string, callback: CallbackData): Promise<PaymentResult>;
  /** İade başlat. */
  refund(input: RefundInput): Promise<RefundResult>;
  /** Ödeme durumunu sorgula. */
  getStatus(intentId: string): Promise<PaymentResult>;
  /** Webhook imza doğrulama + parse. */
  handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
}

// ---------------------------------------------------------------------------
// Provider kayıt defteri (registry)
// ---------------------------------------------------------------------------

/** Provider registry — runtime'da dinamik adaptör çözümleme için. */
export class PaymentProviderRegistry {
  private readonly providers = new Map<PaymentProviderCode, PaymentProvider>();

  /** Provider kaydet (aynı kod iki kez kaydedilemez). */
  register(provider: PaymentProvider): void {
    if (this.providers.has(provider.code)) {
      throw new Error(`Ödeme sağlayıcısı zaten kayıtlı: ${provider.code}`);
    }
    this.providers.set(provider.code, provider);
  }

  /** Provider'ı kod ile getir. */
  get(code: PaymentProviderCode): PaymentProvider | undefined {
    return this.providers.get(code);
  }

  /** Tüm kodları listele. */
  list(): PaymentProviderCode[] {
    return Array.from(this.providers.keys());
  }
}

// ---------------------------------------------------------------------------
// Fiyat / para yardımcıları
// ---------------------------------------------------------------------------

/** Kuruştan TL string'e (görüntüleme için). */
export function formatMoney(amountMinor: number, currency: Currency = 'TRY'): string {
  const value = (amountMinor / 100).toFixed(2);
  const symbol = currency === 'TRY' ? '₺' : currency;
  return `${symbol}${value}`;
}

/** Kuruş → ondalık (Decimal tipi için). */
export function minorToDecimal(minor: number): number {
  return Number((minor / 100).toFixed(4));
}

/** Ondalık → kuruş. */
export function decimalToMinor(decimal: number): number {
  return Math.round(decimal * 100);
}

/** Money tiplerini küçükten büyüğe karşılaştır. */
export function compareMoney(a: Money, b: Money): number {
  if (a.currency !== b.currency) {
    throw new Error(`Para birimi uyuşmaz: ${a.currency} vs ${b.currency}`);
  }
  return a.amount - b.amount;
}

// ---------------------------------------------------------------------------
// Barrel — concrete adaptörler aşağıdaki klasörlerden re-export edilir
// ---------------------------------------------------------------------------

export { IyzicoProvider, type IyzicoCredentials } from './iyzico/index.js';
export { PaytrProvider } from './paytr/index.js';
export { ParamProvider } from './param/index.js';
export { ManualBankTransferProvider } from './manual-bank-transfer/index.js';
export { CashOnDeliveryProvider } from './cash-on-delivery/index.js';