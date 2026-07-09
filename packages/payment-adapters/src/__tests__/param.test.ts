/**
 * Param adaptörü birim testleri.
 *
 * Kapsam:
 *  - init zorunlu alanları kontrol eder
 *  - createPaymentIntent SOAP TP_WMD_UCD'yi doğru parametrelerle çağırır
 *  - createPaymentIntent başarılı → 3D HTML redirect URL'i döner
 *  - createPaymentIntent Param hata kodu → failed intent
 *  - confirmPayment TP_WMD_PayResult ile sorgular
 *  - refund TP_WMD_PAY_IADE çağrısı yapar
 *  - handleWebhook imza doğrular, sandbox'ta bypass eder
 */

import { describe, it, expect } from 'vitest';

import {
  ParamProvider,
  signParamWebhook,
  verifyParamWebhookSignature,
} from '../param/index.js';
import type { CreatePaymentInput, PaymentIntentStatus } from '../index.js';

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const CLIENT_CODE = 'param-code';
const CLIENT_USERNAME = 'param-user';
const CLIENT_PASSWORD = 'param-pass';
const GUID = 'param-guid-xyz';

const TEST_CONFIG = {
  tenantId: 'tenant-a',
  apiKey: CLIENT_CODE,
  apiSecret: CLIENT_USERNAME,
  sandbox: true,
  extras: {
    clientPassword: CLIENT_PASSWORD,
    guid: GUID,
  },
};

function makeInput(overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput {
  return {
    idempotencyKey: 'idem-456',
    tenantId: TEST_CONFIG.tenantId,
    referenceId: 'cartxyz',
    amount: 25000,
    currency: 'TRY',
    items: [
      {
        id: 'variant-1',
        name: 'Param Test Ürün',
        category: 'Test',
        price: 25000,
        quantity: 1,
      },
    ],
    customer: {
      id: 'cust-1',
      email: 'param@example.com',
      firstName: 'Mehmet',
      lastName: 'Kaya',
      phone: '+905559876543',
      ipAddress: '88.45.123.10',
      city: 'Ankara',
      country: 'Turkey',
    },
    shippingAddress: {
      contactName: 'Mehmet Kaya',
      city: 'Ankara',
      country: 'Turkey',
      address: 'Çankaya Kızılay Mh.',
      postalCode: '06420',
    },
    billingAddress: {
      contactName: 'Mehmet Kaya',
      city: 'Ankara',
      country: 'Turkey',
      address: 'Çankaya Kızılay Mh.',
      postalCode: '06420',
    },
    successUrl: 'https://store.test/odeme/basarili',
    failureUrl: 'https://store.test/odeme/basarisiz',
    ...overrides,
  };
}

class MockFetcher {
  public lastUrl = '';
  public lastBody = '';
  public lastHeaders: Record<string, string> = {};
  public responseStatus = 200;
  public responseBody = '';

  async fetch(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{ status: number; text: string }> {
    this.lastUrl = url;
    this.lastBody = init.body;
    this.lastHeaders = init.headers;
    return { status: this.responseStatus, text: this.responseBody };
  }
}

/** SOAP başarılı yanıt üretici. */
function soapResponse(fields: Record<string, string>): string {
  const xml = Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Response>
      ${xml}
    </Response>
  </soap:Body>
</soap:Envelope>`;
}

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('ParamProvider — init', () => {
  it('clientPassword eksikse hata verir', async () => {
    const p = new ParamProvider({ fetcher: new MockFetcher().fetch.bind(new MockFetcher()) });
    await expect(
      p.init({ ...TEST_CONFIG, extras: { guid: GUID } }),
    ).rejects.toThrow(/CLIENT_PASSWORD/);
  });

  it('guid eksikse hata verir', async () => {
    const p = new ParamProvider({ fetcher: new MockFetcher().fetch.bind(new MockFetcher()) });
    await expect(
      p.init({ ...TEST_CONFIG, extras: { clientPassword: CLIENT_PASSWORD } }),
    ).rejects.toThrow(/GUID/);
  });
});

describe('ParamProvider — createPaymentIntent', () => {
  it('TP_WMD_UCD SOAP çağrısı yapar, doğru parametreler gönderilir', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({
      Sonuc: '1',
      Sonuc_Aciklama: 'Onaylandı',
      UCD_HTML: Buffer.from('<form>3d</form>').toString('base64'),
      Islem_ID: 'TX-123',
      TransId: 'idem456',
      Siparis_ID: 'cartxyz',
    });
    const provider = new ParamProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const intent = await provider.createPaymentIntent(makeInput());

    // SOAP action doğru
    expect(fetcher.lastHeaders['SOAPAction']).toBe('https://turkpos.com.tr/TP_WMD_UCD');
    expect(fetcher.lastHeaders['Content-Type']).toBe('text/xml; charset=utf-8');

    // SOAP body doğru parametreleri içerir
    expect(fetcher.lastBody).toContain('<CLIENT_CODE>param-code</CLIENT_CODE>');
    expect(fetcher.lastBody).toContain('<CLIENT_USERNAME>param-user</CLIENT_USERNAME>');
    expect(fetcher.lastBody).toContain('<CLIENT_PASSWORD>param-pass</CLIENT_PASSWORD>');
    expect(fetcher.lastBody).toContain('<GUID>param-guid-xyz</GUID>');
    expect(fetcher.lastBody).toContain('<Tutar>25000</Tutar>');
    expect(fetcher.lastBody).toContain('<Islem_Guvenlik_Tip>3D</Islem_Guvenlik_Tip>');
    expect(fetcher.lastBody).toContain('<TransId>idem456</TransId>');
    expect(fetcher.lastBody).toContain('<IPAdr>88.45.123.10</IPAdr>');
    expect(fetcher.lastBody).toContain('<Siparis_ID>cartxyz</Siparis_ID>');

    // Intent doğru
    expect(intent.providerReference).toBe('idem456');
    expect(intent.status).toBe<PaymentIntentStatus>('pending');
    expect(intent.redirectUrl).toContain('data:text/html;base64,');
  });

  it('Param hata kodu → failed intent, hata mesajı içerir', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({
      Sonuc: '0',
      Hata_Kodu: 'E001',
      Hata_Aciklama: 'Geçersiz müşteri bilgisi',
    });
    const provider = new ParamProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const intent = await provider.createPaymentIntent(makeInput());
    expect(intent.status).toBe<PaymentIntentStatus>('failed');
    expect(intent.errorMessage).toBe('Geçersiz müşteri bilgisi');
  });

  it('5xx yanıt → exception', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseStatus = 502;
    const provider = new ParamProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    await expect(provider.createPaymentIntent(makeInput())).rejects.toThrow(/5xx yanıt/);
  });

  it('sandbox URL kullanılır, prod\'da prod URL\'i seçilir', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({ Sonuc: '1', UCD_HTML: Buffer.from('x').toString('base64') });
    const sandbox = new ParamProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await sandbox.init(TEST_CONFIG);
    await sandbox.createPaymentIntent(makeInput());
    expect(fetcher.lastUrl).toContain('test-dmz.param.com.tr');

    const prodFetcher = new MockFetcher();
    prodFetcher.responseBody = soapResponse({ Sonuc: '1', UCD_HTML: Buffer.from('x').toString('base64') });
    const prod = new ParamProvider({ fetcher: prodFetcher.fetch.bind(prodFetcher) });
    await prod.init({ ...TEST_CONFIG, sandbox: false });
    await prod.createPaymentIntent(makeInput());
    expect(prodFetcher.lastUrl).toContain('dmz.param.com.tr');
    expect(prodFetcher.lastUrl).not.toContain('test-dmz');
  });
});

describe('ParamProvider — confirmPayment', () => {
  it('TP_WMD_PayResult ile sorgular, succeeded döner', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({
      Sonuc: '1',
      Dekont_ID: 'D-456',
      Islem_ID: 'TX-456',
      Tutar: '25000',
    });
    const provider = new ParamProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const result = await provider.confirmPayment('idem456', { token: 'idem456', status: 'success' });
    expect(result.status).toBe<PaymentIntentStatus>('succeeded');
    expect(result.amount).toBe(25000);
    expect(result.providerTransactionId).toBe('D-456');
    expect(fetcher.lastHeaders['SOAPAction']).toBe('https://turkpos.com.tr/TP_WMD_PayResult');
  });

  it('Sonuc=0 → failed sonuç, hata kodu döner', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({
      Sonuc: '0',
      Hata_Kodu: 'P001',
      Hata_Aciklama: '3D doğrulama başarısız',
    });
    const provider = new ParamProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const result = await provider.confirmPayment('idem456', { token: 'idem456', status: 'failure' });
    expect(result.status).toBe<PaymentIntentStatus>('failed');
    expect(result.errorMessage).toBe('3D doğrulama başarısız');
    expect(result.errorCode).toBe('P001');
  });
});

describe('ParamProvider — refund', () => {
  it('TP_WMD_PAY_IADE başarılı → success=true', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({
      Sonuc: '1',
      Dekont_ID: 'REF-789',
      Tutar: '5000',
    });
    const provider = new ParamProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const result = await provider.refund({
      providerReference: 'idem456',
      amount: 5000,
      currency: 'TRY',
      reason: 'Müşteri iptali',
      idempotencyKey: 'refund-1',
    });
    expect(result.success).toBe(true);
    expect(result.providerRefundId).toBe('REF-789');
    expect(fetcher.lastHeaders['SOAPAction']).toBe('https://turkpos.com.tr/TP_WMD_PAY_IADE');
    expect(fetcher.lastBody).toContain('<Tutar>5000</Tutar>');
  });

  it('Param iade reddi → success=false', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({
      Sonuc: '0',
      Hata_Kodu: 'R001',
      Hata_Aciklama: 'İade tutarı orijinal tutarı aşıyor',
    });
    const provider = new ParamProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CONFIG);

    const result = await provider.refund({
      providerReference: 'idem456',
      amount: 100000,
      currency: 'TRY',
      idempotencyKey: 'refund-2',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('İade tutarı orijinal tutarı aşıyor');
  });
});

describe('ParamProvider — handleWebhook', () => {
  it('sandbox\'ta imza doğrulaması bypass edilir, success event parse edilir', async () => {
    const provider = new ParamProvider({
      fetcher: new MockFetcher().fetch.bind(new MockFetcher()),
    });
    await provider.init(TEST_CONFIG);

    const transId = 'idem456';
    const tutar = '25000';
    const sig = signParamWebhook(transId, tutar, GUID);
    const rawBody = Buffer.from(
      `TransId=${transId}&Tutar=${tutar}&Sonuc=1&Dekont_ID=D-1&TransactionDeviceSourceData=${sig}`,
      'utf-8',
    );

    const event = await provider.handleWebhook(rawBody, sig);
    expect(event.provider).toBe('param');
    expect(event.eventType).toBe('payment.success');
    expect(event.status).toBe<PaymentIntentStatus>('succeeded');
    expect(event.amount).toBe(25000);
    expect(event.providerReference).toBe(transId);
  });

  it('prod\'da geçersiz imza reddedilir', async () => {
    const provider = new ParamProvider({
      fetcher: new MockFetcher().fetch.bind(new MockFetcher()),
    });
    await provider.init({ ...TEST_CONFIG, sandbox: false });

    const rawBody = Buffer.from('TransId=x&Tutar=100&Sonuc=1', 'utf-8');
    await expect(
      provider.handleWebhook(rawBody, 'wrong-sig'),
    ).rejects.toThrow(/Param webhook imzası geçersiz/);
  });

  it('eksik alanlar hata fırlatır', async () => {
    const provider = new ParamProvider({
      fetcher: new MockFetcher().fetch.bind(new MockFetcher()),
    });
    await provider.init(TEST_CONFIG);

    await expect(
      provider.handleWebhook(Buffer.from('TransId=x', 'utf-8'), 'sig'),
    ).rejects.toThrow(/zorunlu alanlar eksik/);
  });
});

describe('verifyParamWebhookSignature', () => {
  it('sandbox\'ta bypass', () => {
    const body = Buffer.from('TransId=x&Tutar=100&Sonuc=1', 'utf-8');
    expect(verifyParamWebhookSignature(body, undefined, GUID, true)).toBe(true);
  });

  it('geçerli imza kabul', () => {
    const body = Buffer.from('TransId=x&Tutar=100&Sonuc=1', 'utf-8');
    const sig = signParamWebhook('x', '100', GUID);
    expect(verifyParamWebhookSignature(body, sig, GUID, false)).toBe(true);
  });

  it('yanlış imza red', () => {
    const body = Buffer.from('TransId=x&Tutar=100&Sonuc=1', 'utf-8');
    expect(verifyParamWebhookSignature(body, 'bogus', GUID, false)).toBe(false);
  });
});