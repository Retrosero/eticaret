/**
 * PayTR adaptörü birim testleri.
 *
 * Kapsam:
 *  - createPaymentIntent başarılı token döner, doğru URL ile
 *  - createPaymentIntent PayTR hata kodu döndüğünde exception/başarısız intent
 *  - handleWebhook geçerli imza kabul eder
 *  - handleWebhook geçersiz imza reddeder
 *  - refund başarılı iade döner
 *  - getStatus confirmPayment ile aynı endpoint'i kullanır
 *  - init merchant_salt eksikse hata verir
 */

import { describe, it, expect } from 'vitest';

import {
  PaytrProvider,
  signPaytrWebhook,
  verifyPaytrWebhookSignature,
} from '../paytr/index.js';
import type { CreatePaymentInput, PaymentIntentStatus } from '../index.js';

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const MERCHANT_ID = '12345';
const MERCHANT_KEY = 'paytr-test-key';
const MERCHANT_SALT = 'paytr-test-salt';

const TEST_CONFIG = {
  tenantId: 'tenant-a',
  apiKey: MERCHANT_ID,
  apiSecret: MERCHANT_KEY,
  sandbox: true,
  extras: { merchantSalt: MERCHANT_SALT },
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

describe('PaytrProvider — init', () => {
  it('merchantSalt eksikse hata fırlatır', async () => {
    const provider = new PaytrProvider({
      fetcher: new MockFetcher().fetch.bind(new MockFetcher()),
    });
    await expect(
      provider.init({ ...TEST_CONFIG, extras: {} }),
    ).rejects.toThrow(/merchant_salt/);
  });

  it('apiKey eksikse hata fırlatır', async () => {
    const provider = new PaytrProvider({
      fetcher: new MockFetcher().fetch.bind(new MockFetcher()),
    });
    await expect(
      provider.init({ ...TEST_CONFIG, apiKey: '' }),
    ).rejects.toThrow(/merchant_id/);
  });
});

describe('PaytrProvider — createPaymentIntent', () => {
  it('başarılı token döner, doğru iframe URL\'i üretir', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = { status: 'success', token: 'paytr-iframe-token-xyz' };
    const provider = new PaytrProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const intent = await provider.createPaymentIntent(makeInput());

    // PayTR get-token endpoint'i çağrıldı
    expect(fetcher.lastUrl).toMatch(/\/api\/get-token$/);
    expect(fetcher.lastHeaders['Content-Type']).toBe('application/x-www-form-urlencoded');

    // Payload alanları doğru
    const params = new URLSearchParams(fetcher.lastBody);
    expect(params.get('merchant_id')).toBe(MERCHANT_ID);
    expect(params.get('merchant_key')).toBe(MERCHANT_KEY);
    expect(params.get('merchant_salt')).toBe(MERCHANT_SALT);
    expect(params.get('email')).toBe('musteri@example.com');
    expect(params.get('payment_amount')).toBe('19990');
    expect(params.get('currency')).toBe('TRY');
    expect(params.get('test_mode')).toBe('1');
    expect(params.get('user_ip')).toBe('85.105.45.12');
    expect(params.get('merchant_ok_url')).toBe('https://store.test/odeme/basarili');
    // Basket JSON içermeli
    const basket = JSON.parse(params.get('user_basket') ?? '[]');
    expect(Array.isArray(basket)).toBe(true);
    expect(basket[0].name).toBe('Test Ürün');
    expect(basket[0].price).toBe('99.95');
    expect(basket[0].quantity).toBe(2);
    // paytr_token HMAC üretilmiş olmalı (boş değil)
    expect(params.get('paytr_token')).toBeTruthy();
    expect(params.get('paytr_token')?.length).toBeGreaterThan(20);

    // Intent doğru
    expect(intent.providerReference).toMatch(/^cart-abc-/);
    expect(intent.status).toBe<PaymentIntentStatus>('pending');
    expect(intent.redirectUrl).toBe('https://www.paytr.com/odeme/guvenli/paytr-iframe-token-xyz');
  });

  it('PayTR hata kodu döndüğünde failed intent ve hata mesajı döner', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = {
      status: 'failed',
      reason: 'KART BİLGİSİ GEÇERSİZ',
    };
    const provider = new PaytrProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const intent = await provider.createPaymentIntent(makeInput());
    expect(intent.status).toBe<PaymentIntentStatus>('failed');
    expect(intent.errorMessage).toBe('KART BİLGİSİ GEÇERSİZ');
  });

  it('5xx yanıtta exception fırlatır', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseStatus = 503;
    fetcher.responseBody = {};
    const provider = new PaytrProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    await expect(provider.createPaymentIntent(makeInput())).rejects.toThrow(/5xx yanıt/);
  });
});

describe('PaytrProvider — handleWebhook', () => {
  it('geçerli imza kabul edilir, event parse edilir', async () => {
    const provider = new PaytrProvider({
      fetcher: new MockFetcher().fetch.bind(new MockFetcher()),
    });
    await provider.init(TEST_CONFIG);

    const merchantOid = 'cart-abc-idem123';
    const totalAmount = '19990';
    const status = 'success' as const;
    const sig = signPaytrWebhook(merchantOid, MERCHANT_SALT, status, totalAmount, MERCHANT_KEY);

    const rawBody = new URLSearchParams({
      merchant_oid: merchantOid,
      status,
      total_amount: totalAmount,
      hash: sig,
      currency: 'TRY',
      payment_type: 'card',
    }).toString();

    const event = await provider.handleWebhook(Buffer.from(rawBody, 'utf-8'), sig);
    expect(event.provider).toBe('paytr');
    expect(event.eventType).toBe('payment.success');
    expect(event.status).toBe<PaymentIntentStatus>('succeeded');
    expect(event.providerReference).toBe(merchantOid);
    expect(event.amount).toBe(19990);
  });

  it('geçersiz imza reddedilir', async () => {
    const provider = new PaytrProvider({
      fetcher: new MockFetcher().fetch.bind(new MockFetcher()),
    });
    await provider.init(TEST_CONFIG);

    const rawBody = new URLSearchParams({
      merchant_oid: 'cart-1',
      status: 'success',
      total_amount: '19990',
      hash: 'yanlis-hash',
    }).toString();

    await expect(
      provider.handleWebhook(Buffer.from(rawBody, 'utf-8'), 'yanlis-hash'),
    ).rejects.toThrow(/PayTR webhook imzası geçersiz/);
  });

  it('eksik alanlar hata fırlatır', async () => {
    const provider = new PaytrProvider({
      fetcher: new MockFetcher().fetch.bind(new MockFetcher()),
    });
    await provider.init(TEST_CONFIG);

    const rawBody = new URLSearchParams({ merchant_oid: 'x' }).toString();
    await expect(
      provider.handleWebhook(Buffer.from(rawBody, 'utf-8'), 'sig'),
    ).rejects.toThrow(/zorunlu alanlar eksik/);
  });

  it('failed callback → payment.failed eventi ve failed durum', async () => {
    const provider = new PaytrProvider({
      fetcher: new MockFetcher().fetch.bind(new MockFetcher()),
    });
    await provider.init(TEST_CONFIG);

    const merchantOid = 'cart-abc';
    const totalAmount = '19990';
    const status = 'failed' as const;
    const sig = signPaytrWebhook(merchantOid, MERCHANT_SALT, status, totalAmount, MERCHANT_KEY);

    const rawBody = new URLSearchParams({
      merchant_oid: merchantOid,
      status,
      total_amount: totalAmount,
      hash: sig,
    }).toString();

    const event = await provider.handleWebhook(Buffer.from(rawBody, 'utf-8'), sig);
    expect(event.eventType).toBe('payment.failed');
    expect(event.status).toBe<PaymentIntentStatus>('failed');
  });
});

describe('PaytrProvider — refund', () => {
  it('başarılı iade döner', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = {
      status: 'success',
      refund_amount: '5000',
      merchant_oid: 'cart-abc',
    };
    const provider = new PaytrProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const result = await provider.refund({
      providerReference: 'cart-abc',
      providerTransactionId: 'cart-abc',
      amount: 5000,
      currency: 'TRY',
      reason: 'Müşteri iptali',
      idempotencyKey: 'idem-refund-1',
    });
    expect(result.success).toBe(true);
    expect(result.amount).toBe(5000);
    expect(result.currency).toBe('TRY');

    const params = new URLSearchParams(fetcher.lastBody);
    expect(params.get('merchant_id')).toBe(MERCHANT_ID);
    expect(params.get('merchant_oid')).toBe('cart-abc');
    expect(params.get('refund_amount')).toBe('5000');
    expect(params.get('paytr_token')).toBeTruthy();
  });

  it('PayTR iade reddi → success=false', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = {
      status: 'failed',
      reason: 'İADE TUTARI GEÇERSİZ',
    };
    const provider = new PaytrProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const result = await provider.refund({
      providerReference: 'cart-abc',
      amount: 5000,
      currency: 'TRY',
      idempotencyKey: 'idem-r-2',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('İADE TUTARI GEÇERSİZ');
  });
});

describe('PaytrProvider — getStatus', () => {
  it('status sorgusu yapar, succeeded döner', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = {
      status: 'success',
      payment_status: '1',
      payment_total: '19990',
      currency: 'TRY',
      merchant_oid: 'cart-abc',
    };
    const provider = new PaytrProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const result = await provider.getStatus('cart-abc');
    expect(result.status).toBe<PaymentIntentStatus>('succeeded');
    expect(result.amount).toBe(19990);
    expect(fetcher.lastUrl).toMatch(/\/api\/status$/);
  });
});

describe('verifyPaytrWebhookSignature yardımcıları', () => {
  it('doğru secret ile üretilen imzayı kabul eder', () => {
    const body = Buffer.from('merchant_oid=x&status=success&total_amount=100', 'utf-8');
    const sig = signPaytrWebhook('x', MERCHANT_SALT, 'success', '100', MERCHANT_KEY);
    expect(verifyPaytrWebhookSignature(body, sig, MERCHANT_KEY, MERCHANT_SALT)).toBe(true);
  });

  it('yanlış secret reddeder', () => {
    const body = Buffer.from('merchant_oid=x&status=success&total_amount=100', 'utf-8');
    const sig = signPaytrWebhook('x', MERCHANT_SALT, 'success', '100', 'wrong-key');
    expect(verifyPaytrWebhookSignature(body, sig, MERCHANT_KEY, MERCHANT_SALT)).toBe(false);
  });

  it('imza yoksa reddeder', () => {
    expect(verifyPaytrWebhookSignature(Buffer.from(''), undefined, MERCHANT_KEY, MERCHANT_SALT)).toBe(false);
  });
});