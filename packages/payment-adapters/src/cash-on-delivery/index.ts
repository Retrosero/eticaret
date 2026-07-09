/**
 * Kapıda ödeme (Cash on Delivery) adaptörü.
 *
 * Akış:
 *   1. Müşteri checkout'ta "Kapıda Ödeme" seçer
 *   2. createPaymentIntent → tenant ayarına göre ek ücret hesaplanır
 *   3. Sipariş onaylanır → status başlangıçta "pending" (kargo sırasında ödeme alınır)
 *   4. Kargo teslim edildiğinde admin tarafından "succeeded" yapılır
 *
 * Tenant ayarları:
 *   - codEnabled: bool — kapıda ödeme aktif mi?
 *   - codExtraFeeMinor: number — ek ücret (kuruş)
 *   - codMinAmountMinor: number — minimum sipariş tutarı
 *   - codMaxAmountMinor: number — maksimum sipariş tutarı
 */

import type {
  CallbackData,
  CreatePaymentInput,
  PaymentIntent,
  PaymentProvider,
  PaymentProviderCode,
  PaymentResult,
  ProviderConfig,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from '../index.js';

export interface CashOnDeliverySettings {
  enabled: boolean;
  /** Ek ücret (kuruş). */
  extraFeeMinor: number;
  /** Minimum sipariş tutarı (kuruş). */
  minAmountMinor?: number;
  /** Maksimum sipariş tutarı (kuruş). */
  maxAmountMinor?: number;
}

export class CashOnDeliveryProvider implements PaymentProvider {
  public readonly code: PaymentProviderCode = 'cash_on_delivery';

  /** Tenant başına ayarlar. */
  private readonly settings = new Map<string, CashOnDeliverySettings>();

  async init(config: ProviderConfig): Promise<void> {
    const extras = config.extras ?? {};
    const settings: CashOnDeliverySettings = {
      enabled: extras['codEnabled'] !== false, // varsayılan true
      extraFeeMinor: Number(extras['codExtraFeeMinor'] ?? 0),
      minAmountMinor: extras['codMinAmountMinor']
        ? Number(extras['codMinAmountMinor'])
        : undefined,
      maxAmountMinor: extras['codMaxAmountMinor']
        ? Number(extras['codMaxAmountMinor'])
        : undefined,
    };
    if (!settings.enabled) {
      throw new Error('Kapıda ödeme bu tenant için devre dışı');
    }
    this.settings.set(config.tenantId, settings);
  }

  async createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent> {
    const s = this.settings.get(input.tenantId);
    if (!s) throw new Error('Kapıda ödeme ayarları tanımsız');

    if (s.minAmountMinor !== undefined && input.amount < s.minAmountMinor) {
      throw new Error(
        `Kapıda ödeme minimum tutarı: ${(s.minAmountMinor / 100).toFixed(2)} TRY`,
      );
    }
    if (s.maxAmountMinor !== undefined && input.amount > s.maxAmountMinor) {
      throw new Error(
        `Kapıda ödeme maksimum tutarı: ${(s.maxAmountMinor / 100).toFixed(2)} TRY`,
      );
    }

    return {
      providerReference: `cod-${input.idempotencyKey}`,
      provider: this.code,
      status: 'pending', // kargo tesliminde ödeme alınır
      raw: { extraFeeMinor: s.extraFeeMinor },
    };
  }

  async confirmPayment(_intentId: string, _callback: CallbackData): Promise<PaymentResult> {
    throw new Error('Kapıda ödeme admin onayı gerektirir');
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new Error('Kapıda ödeme iadesi admin panelinden yapılmalı');
  }

  async getStatus(_intentId: string): Promise<PaymentResult> {
    return {
      providerReference: _intentId,
      status: 'pending',
      amount: 0,
      currency: 'TRY',
    };
  }

  async handleWebhook(_rawBody: Buffer, _signature: string): Promise<WebhookEvent> {
    throw new Error('Kapıda ödeme adaptöründe webhook kullanılmaz');
  }
}