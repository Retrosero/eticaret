/**
 * iyzico adaptörü birim testleri.
 *
 * Amaçlar:
 *  - createPaymentIntent iyzico'nun beklediği JSON formatını üretir
 *  - Sandbox URL'i doğru seçilir
 *  - Webhook imza doğrulaması (HMAC SHA256) çalışır
 *  - Yanlış imza reddedilir
 *  - Tamamlanmış ödeme → "succeeded" durumuna eşlenir
 *  - Yanlış token → "failed" durumuna eşlenir
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

import {
  IyzicoProvider,
  signIyzicoWebhook,
  verifyIyzicoWebhookSignature,
} from '../iyzico/index.js';
import type { CreatePaymentInput, PaymentIntentStatus } from '../index.js';

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  tenantId: 'tenant-a',
  apiKey: 'iyzico-test-key',
  apiSecret: 'iyzico-test-secret',
  sandbox: true,
};

function makeInput(overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput {
  return {
    idempotencyKey: 'idem-123',
    tenantId: TEST_CONFIG.tenantId,
    referenceId: 'cart-abc',
    amount: 19990, // 199.90 TRY
    currency: 'TRY',
    items: [
      {
        id: 'variant-1',
        name: 'Test Ürün',
        category: 'Test',
        price: 9995,
        quantity: 2,
      },
    ],
    customer: {
      id: 'cust-1',
      email: 'musteri@example.com',
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      phone: '+905551234567',
      ipAddress: '85.105.45.12',
      city: 'İstanbul',
      country: 'Turkey',
    },
    shippingAddress: {
      contactName: 'Ayşe Yılmaz',
      city: 'İstanbul',
      country: 'Turkey',
      address: 'Kadıköy Caferağa Mh.',
      postalCode: '34710',
    },
    billingAddress: {
      contactName: 'Ayşe Yılmaz',
      city: 'İstanbul',
      country: 'Turkey',
      address: 'Kadıköy Caferağa Mh.',
      postalCode: '34710',
    },
    successUrl: 'https://store.test/odeme/basarili',
    failureUrl: 'https://store.test/odeme/basarisiz',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock fetcher
// ---------------------------------------------------------------------------

class MockFetcher {
  public lastUrl = '';
  public lastBody = '';
  public lastHeaders: Record<string, string> = {};
  public responseStatus = 200;
  public responseBody: unknown = {};

  async fetch(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{ status: number; text: string }> {
    this.lastUrl = url;
    this.lastBody = init.body;
    this.lastHeaders = init.headers;
    return { status: this.responseStatus, text: JSON.stringify(this.responseBody) };
  }
}

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('IyzicoProvider', () => {
  it('createPaymentIntent — iyzico initialize endpointine doğru payload gönderir', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = {
      status: 'success',
      token: 'iyzico-token-xyz',
      payWithIyzicoSignedUrl: 'https://sandbox-api.iyzipay.com/pay/xyz',
    };
    const provider = new IyzicoProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const intent = await provider.createPaymentIntent(makeInput());

    // URL doğru
    expect(fetcher.lastUrl).toMatch(/\/payment\/iyzipos\/checkoutform\/initialize\/auth\/ecom$/);
    expect(fetcher.lastUrl.startsWith('https://sandbox-api.iyzipay.com')).toBe(true);

    // Auth header Basic encoded
    expect(fetcher.lastHeaders['Authorization']).toMatch(/^Basic /);

    // Payload doğru alanları içerir
    const payload = JSON.parse(fetcher.lastBody) as Record<string, unknown>;
    expect(payload['basketId']).toBe('cart-abc');
    expect(payload['conversationId']).toBe('idem-123');
    expect(payload['price']).toBe('199.90');
    expect(payload['paidPrice']).toBe('199.90');
    expect(payload['currency']).toBe('TRY');
    expect(Array.isArray(payload['basketItems'])).toBe(true);
    expect((payload['buyer'] as Record<string, unknown>)['email']).toBe('musteri@example.com');

    // Intent döner
    expect(intent.providerReference).toBe('iyzico-token-xyz');
    expect(intent.status).toBe<PaymentIntentStatus>('pending');
    expect(intent.redirectUrl).toBe('https://sandbox-api.iyzipay.com/pay/xyz');
  });

  it('createPaymentIntent — iyzico failure yanıtında "failed" intent döner', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = {
      status: 'failure',
      errorCode: '10051',
      errorMessage: 'Kart limiti yetersiz',
    };
    const provider = new IyzicoProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const intent = await provider.createPaymentIntent(makeInput());
    expect(intent.status).toBe<PaymentIntentStatus>('failed');
  });

  it('createPaymentIntent — prod config sandbox URL\'ini kapatır', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = { status: 'success', token: 't', payWithIyzicoSignedUrl: 'x' };
    const provider = new IyzicoProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init({ ...TEST_CONFIG, sandbox: false });
    await provider.createPaymentIntent(makeInput());
    expect(fetcher.lastUrl.startsWith('https://api.iyzipay.com')).toBe(true);
    expect(fetcher.lastUrl.startsWith('https://sandbox-api.iyzipay.com')).toBe(false);
  });

  it('confirmPayment — "SUCCESS" → succeeded durumuna eşlenir', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = {
      status: 'success',
      paymentStatus: 'SUCCESS',
      paymentTransactionId: 'tx-1',
      paidPrice: '199.90',
      currency: 'TRY',
    };
    const provider = new IyzicoProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const result = await provider.confirmPayment('tok-1', {
      token: 'tok-1',
      status: 'success',
    });
    expect(result.status).toBe<PaymentIntentStatus>('succeeded');
    expect(result.amount).toBe(19990);
    expect(result.currency).toBe('TRY');
    expect(result.providerTransactionId).toBe('tx-1');
  });

  it('confirmPayment — "FAILURE" → failed durumuna eşlenir', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = {
      status: 'failure',
      paymentStatus: 'FAILURE',
      errorCode: '10051',
      errorMessage: '3DS doğrulama başarısız',
    };
    const provider = new IyzicoProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const result = await provider.confirmPayment('tok-1', { token: 'tok-1', status: 'failure' });
    expect(result.status).toBe<PaymentIntentStatus>('failed');
    expect(result.errorCode).toBe('10051');
  });

  it('handleWebhook — geçerli imza kabul edilir', async () => {
    const provider = new IyzicoProvider({ fetcher: new MockFetcher().fetch.bind(new MockFetcher()) });
    await provider.init(TEST_CONFIG);

    const rawBody = Buffer.from(
      JSON.stringify({
        paymentConversationId: 'tok-1',
        paymentId: 'tx-1',
        paymentStatus: 'SUCCESS',
        paidPrice: 199.9,
        currency: 'TRY',
        eventType: 'payment.success',
      }),
      'utf-8',
    );
    const sig = signIyzicoWebhook(rawBody, TEST_CONFIG.apiSecret);

    const event = await provider.handleWebhook(rawBody, sig);
    expect(event.provider).toBe('iyzico');
    expect(event.status).toBe<PaymentIntentStatus>('succeeded');
    expect(event.providerReference).toBe('tok-1');
    expect(event.amount).toBe(19990);
  });

  it('handleWebhook — geçersiz imza reddedilir', async () => {
    const provider = new IyzicoProvider({ fetcher: new MockFetcher().fetch.bind(new MockFetcher()) });
    await provider.init(TEST_CONFIG);

    const rawBody = Buffer.from('{"eventType":"payment.success"}', 'utf-8');
    await expect(
      provider.handleWebhook(rawBody, 'yanlis-imza-0000'),
    ).rejects.toThrow('Webhook imzası geçersiz');
  });

  it('refund — iyzico refund endpointine doğru payload gider', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = {
      status: 'success',
      paymentTransactionId: 'refund-tx-1',
      paymentId: 'pay-1',
      price: '50.00',
      currency: 'TRY',
    };
    const provider = new IyzicoProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const result = await provider.refund({
      providerReference: 'tok-1',
      providerTransactionId: 'tx-1',
      amount: 5000,
      currency: 'TRY',
      reason: 'Müşteri iptali',
      idempotencyKey: 'idem-refund-1',
    });
    expect(result.success).toBe(true);
    expect(result.amount).toBe(5000);

    const payload = JSON.parse(fetcher.lastBody) as Record<string, unknown>;
    expect(payload['paymentTransactionId']).toBe('tx-1');
    expect(payload['price']).toBe('50.00');
    expect(payload['currency']).toBe('TRY');
  });
});

describe('verifyIyzicoWebhookSignature', () => {
  it('doğru secret ile üretilen imzayı kabul eder', () => {
    const body = Buffer.from('{"foo":"bar"}', 'utf-8');
    const sig = createHmac('sha256', 'secret-A').update(body).digest('hex');
    expect(verifyIyzicoWebhookSignature(body, sig, 'secret-A')).toBe(true);
  });

  it('farklı secret ile imzalanan imzayı reddeder', () => {
    const body = Buffer.from('{"foo":"bar"}', 'utf-8');
    const sig = createHmac('sha256', 'secret-A').update(body).digest('hex');
    expect(verifyIyzicoWebhookSignature(body, sig, 'secret-B')).toBe(false);
  });

  it('imza yoksa reddeder', () => {
    expect(verifyIyzicoWebhookSignature(Buffer.from(''), undefined, 'secret-A')).toBe(false);
  });
});