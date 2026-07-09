/**
 * Havale / EFT manuel ödeme adaptörü.
 *
 * Akış:
 *   1. Müşteri checkout'ta "Havale/EFT" seçer
 *   2. createPaymentIntent → tenant IBAN bilgisi ile "pending" intent döner
 *   3. Müşteri sipariş ekranında IBAN'ı görür, dekont yükler
 *   4. Tenant admin panelden ödemeyi onaylar → status "succeeded" olur
 *
 * Güvenlik:
 *   - IBAN bilgisi tenant başına izoledir
 *   - Onay mekanizması admin yetkisi gerektirir (Faz 8'de auth entegrasyonu)
 *   - Idempotency için conversationId kullanılır
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

/** Manuel banka transferi ek metadata. */
export interface BankTransferInfo {
  /** Tenant IBAN'ları (TRY). */
  ibanTry: string;
  /** Opsiyonel IBAN (USD/EUR için). */
  ibanUsd?: string;
  ibanEur?: string;
  /** Alıcı ünvanı. */
  accountHolder: string;
  /** Banka adı. */
  bankName: string;
  /** Dekont yükleme talimatı. */
  receiptInstructions?: string;
}

export class ManualBankTransferProvider implements PaymentProvider {
  public readonly code: PaymentProviderCode = 'manual_bank_transfer';

  /** Tenant başına IBAN bilgisi cache. */
  private readonly bankInfoCache = new Map<string, BankTransferInfo>();

  async init(config: ProviderConfig): Promise<void> {
    // IBAN bilgisi provider config extras üzerinden gelir
    const extras = config.extras ?? {};
    const bankInfo: BankTransferInfo = {
      ibanTry: String(extras['ibanTry'] ?? ''),
      ibanUsd: extras['ibanUsd'] as string | undefined,
      ibanEur: extras['ibanEur'] as string | undefined,
      accountHolder: String(extras['accountHolder'] ?? ''),
      bankName: String(extras['bankName'] ?? ''),
      receiptInstructions: extras['receiptInstructions'] as string | undefined,
    };
    if (!bankInfo.ibanTry || !bankInfo.accountHolder) {
      throw new Error('Manuel havale: ibanTry ve accountHolder zorunlu');
    }
    this.bankInfoCache.set(config.tenantId, bankInfo);
  }

  async createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent> {
    const info = this.bankInfoCache.get(input.tenantId);
    if (!info) {
      throw new Error('Tenant için banka bilgisi tanımlı değil');
    }
    // Pending intent, admin onayı bekler
    return {
      providerReference: `manual-${input.idempotencyKey}`,
      provider: this.code,
      status: 'pending',
      // redirectUrl yok — müşteri aynı sayfada IBAN'ı görür
      raw: { ibanTry: info.ibanTry, accountHolder: info.accountHolder, bankName: info.bankName },
    };
  }

  async confirmPayment(_intentId: string, _callback: CallbackData): Promise<PaymentResult> {
    // Manuel ödeme admin onayı bekler; burada otomatik başarılı yapılmaz
    throw new Error('Manuel ödeme admin onayı gerektirir (refund/confirm admin endpoint\'i kullanılmalı)');
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    // Manuel ödemede iade yine manuel banka transferi ile yapılır (admin panelinden)
    throw new Error('Manuel ödeme iadesi admin paneli üzerinden yapılmalı');
  }

  async getStatus(_intentId: string): Promise<PaymentResult> {
    // Manuel ödemede durum DB'den sorgulanır; provider'ın getStatus'ı sadece şablon
    return {
      providerReference: _intentId,
      status: 'pending',
      amount: 0,
      currency: 'TRY',
    };
  }

  async handleWebhook(_rawBody: Buffer, _signature: string): Promise<WebhookEvent> {
    // Manuel ödemede webhook yoktur
    throw new Error('Manuel havale adaptöründe webhook kullanılmaz');
  }
}