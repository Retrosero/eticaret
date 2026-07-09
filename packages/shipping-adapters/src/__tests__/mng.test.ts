/**
 * MNG Kargo adaptörü birim testleri.
 *
 * Kapsam:
 *  - init OAuth2 token alır
 *  - getRates desi + aynı şehir indirimi + ücretsiz kargo limiti
 *  - createShipment POST /shipments, Authorization header, barkod URL'i
 *  - trackShipment GET /tracking, durum eşlemesi
 *  - cancelShipment DELETE /shipments
 *  - Token cache TTL'i (refresh margin öncesi yenilemez)
 *  - Yardımcı: fetchMngAccessToken
 */

import { describe, it, expect } from 'vitest';

import { MngProvider, fetchMngAccessToken } from '../mng/index.js';
import type { Fetcher as IFetcher } from '../mng/index.js';
import type {
  RateInput,
  ShipmentInput,
  ShippingProviderConfig,
} from '../index.js';

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const TEST_CFG: ShippingProviderConfig = {
  tenantId: 'tenant-a',
  apiKey: 'mng-client-id',
  apiSecret: 'mng-client-secret',
  sandbox: true,
  extras: {
    customerCode: 'MC-001',
    pricing: {
      perDesiMinor: 1300,
      baseRateMinor: 2900,
      freeShippingThresholdMinor: 50000,
      sameCityDiscount: 0.3,
      codExtraFeeMinor: 990,
      estimatedDays: 2,
    },
  },
};

function makeRateInput(overrides: Partial<RateInput> = {}): RateInput {
  return {
    tenantId: 'tenant-a',
    originCity: 'İstanbul',
    destinationCity: 'İzmir',
    pkg: { weightGrams: 2000, desi: 3 },
    packageCount: 1,
    orderTotalMinor: 10000,
    ...overrides,
  };
}

function makeShipmentInput(overrides: Partial<ShipmentInput> = {}): ShipmentInput {
  return {
    tenantId: 'tenant-a',
    orderId: 'order-mng-001',
    recipient: {
      fullName: 'Zeynep Demir',
      phone: '+905559876543',
      email: 'zeynep@example.com',
      address: 'Alsancak Mah. Kıbrıs Şehitleri Cd.',
      city: 'İzmir',
      district: 'Konak',
      postalCode: '35220',
    },
    pkg: { weightGrams: 2000, desi: 3 },
    packageCount: 1,
    ...overrides,
  };
}

/** Mock fetcher — route'a göre yanıt verir. */
class MockFetcher implements IFetcher {
  public calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body?: string } }> = [];
  public routeResponse: Record<string, { status: number; body: unknown }> = {};
  public defaultResponse = { status: 200, body: {} as unknown };

  setResponse(urlPattern: string, status: number, body: unknown) {
    this.routeResponse[urlPattern] = { status, body };
  }

  async fetch(url: string, init: { method: string; headers: Record<string, string>; body?: string }) {
    this.calls.push({ url, init });
    for (const [pattern, resp] of Object.entries(this.routeResponse)) {
      if (url.includes(pattern)) {
        const text = typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body);
        return { status: resp.status, text };
      }
    }
    const text =
      typeof this.defaultResponse.body === 'string'
        ? this.defaultResponse.body
        : JSON.stringify(this.defaultResponse.body);
    return { status: this.defaultResponse.status, text };
  }
}

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('MngProvider — init', () => {
  it('tenantId zorunlu', async () => {
    const p = new MngProvider({ fetcher: new MockFetcher().fetch.bind(new MockFetcher()) });
    await expect(p.init({ ...TEST_CFG, tenantId: '' })).rejects.toThrow(/tenantId/);
  });

  it('client_id zorunlu', async () => {
    const p = new MngProvider({ fetcher: new MockFetcher().fetch.bind(new MockFetcher()) });
    await expect(p.init({ ...TEST_CFG, apiKey: '' })).rejects.toThrow(/client_id/);
  });

  it('client_secret zorunlu', async () => {
    const p = new MngProvider({ fetcher: new MockFetcher().fetch.bind(new MockFetcher()) });
    await expect(p.init({ ...TEST_CFG, apiSecret: '' })).rejects.toThrow(/client_secret/);
  });

  it('init OAuth2 token alır (POST /oauth/token)', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, {
      access_token: 'test-token-xyz',
      token_type: 'Bearer',
      expires_in: 3600,
    });
    const p = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await p.init(TEST_CFG);

    const oauthCall = fetcher.calls.find((c) => c.url.includes('/oauth/token'));
    expect(oauthCall).toBeDefined();
    expect(oauthCall!.init.method).toBe('POST');
    expect(oauthCall!.init.body).toContain('grant_type=client_credentials');
    expect(oauthCall!.init.body).toContain('client_id=mng-client-id');
    expect(oauthCall!.init.body).toContain('client_secret=mng-client-secret');
  });
});

describe('MngProvider — getRates', () => {
  it('desi + aynı şehir indirimi uygular', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 't', expires_in: 3600 });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const crossCity = await provider.getRates(
      makeRateInput({ originCity: 'İstanbul', destinationCity: 'İzmir' }),
    );
    const sameCity = await provider.getRates(
      makeRateInput({ originCity: 'İstanbul', destinationCity: 'İstanbul' }),
    );

    expect(sameCity[0].amountMinor).toBeLessThan(crossCity[0].amountMinor);
    expect(sameCity[0].metadata?.['sameCity']).toBe(true);
    expect(crossCity[0].metadata?.['sameCity']).toBe(false);
  });

  it('ücretsiz kargo limiti uygular', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 't', expires_in: 3600 });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const rates = await provider.getRates(makeRateInput({ orderTotalMinor: 60000 }));
    expect(rates).toHaveLength(1);
    expect(rates[0].amountMinor).toBe(0);
    expect(rates[0].serviceCode).toBe('MNG_STD');
  });

  it('COD ek ücreti ekler', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 't', expires_in: 3600 });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const ratesNormal = await provider.getRates(makeRateInput({ metadata: {} }));
    const ratesCod = await provider.getRates(
      makeRateInput({ metadata: { cashOnDelivery: true } }),
    );
    expect(ratesCod[0].amountMinor).toBe(ratesNormal[0].amountMinor + 990);
  });

  it('iki hizmet seçeneği (Standart + Hızlı) döner', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 't', expires_in: 3600 });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const rates = await provider.getRates(makeRateInput({ orderTotalMinor: 10000 }));
    expect(rates).toHaveLength(2);
    expect(rates[0].serviceCode).toBe('MNG_STD');
    expect(rates[1].serviceCode).toBe('MNG_EXP');
    expect(rates[1].amountMinor).toBe(Math.round(rates[0].amountMinor * 1.5));
  });
});

describe('MngProvider — createShipment', () => {
  it('POST /shipments ile gönderi oluşturur, Authorization header ekler', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 'jwt-token-abc', expires_in: 3600 });
    fetcher.setResponse('/api/v2/shipments', 201, {
      trackingNumber: 'MNG-987654321',
      barcode: 'MNG-987654321',
      estimatedDelivery: '2026-07-05T00:00:00Z',
    });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const shipment = await provider.createShipment(makeShipmentInput());

    // OAuth call atıldı
    const shipCall = fetcher.calls.find((c) => c.url.endsWith('/api/v2/shipments'));
    expect(shipCall).toBeDefined();
    expect(shipCall!.init.method).toBe('POST');
    expect(shipCall!.init.headers['Authorization']).toBe('Bearer jwt-token-abc');
    expect(shipCall!.init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(shipCall!.init.body ?? '{}');
    expect(body.reference).toBe('order-mng-001');
    expect(body.receiver.name).toBe('Zeynep Demir');
    expect(body.receiver.city).toBe('İzmir');
    expect(body.package.desi).toBe(3);
    expect(body.package.count).toBe(1);

    // Dönen shipment
    expect(shipment.trackingNumber).toBe('MNG-987654321');
    expect(shipment.barcodeUrl).toContain('MNG-987654321');
    expect(shipment.barcodeUrl).toContain('mngkargo');
  });

  it('5xx yanıtta exception fırlatır', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 't', expires_in: 3600 });
    fetcher.setResponse('/api/v2/shipments', 503, {});
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    await expect(provider.createShipment(makeShipmentInput())).rejects.toThrow(/5xx yanıt/);
  });

  it('trackingNumber yoksa hata mesajı fırlatır', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 't', expires_in: 3600 });
    fetcher.setResponse('/api/v2/shipments', 400, {
      message: 'Geçersiz müşteri kodu',
    });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    await expect(provider.createShipment(makeShipmentInput())).rejects.toThrow(/Geçersiz müşteri kodu/);
  });
});

describe('MngProvider — trackShipment', () => {
  it('GET /tracking/{number}, durum eşlemesi yapar', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 't', expires_in: 3600 });
    fetcher.setResponse('/api/v2/tracking/MNG-987654321', 200, {
      trackingNumber: 'MNG-987654321',
      status: 'OUT_FOR_DELIVERY',
      estimatedDelivery: '2026-07-04T18:00:00Z',
      events: [
        {
          timestamp: '2026-07-03T10:00:00Z',
          location: 'İzmir Şubesi',
          status: 'AT_BRANCH',
          description: 'Şubeye geldi',
        },
        {
          timestamp: '2026-07-03T14:00:00Z',
          location: 'İzmir Dağıtım',
          status: 'OUT_FOR_DELIVERY',
          description: 'Dağıtıma çıktı',
        },
      ],
    });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const tracking = await provider.trackShipment('MNG-987654321');

    const trackCall = fetcher.calls.find((c) => c.url.includes('/api/v2/tracking/'));
    expect(trackCall!.init.method).toBe('GET');
    expect(trackCall!.init.headers['Authorization']).toBe('Bearer t');

    expect(tracking.status).toBe('out_for_delivery');
    expect(tracking.events).toHaveLength(2);
    expect(tracking.events[0].location).toBe('İzmir Şubesi');
    expect(tracking.events[0].status).toBe('at_branch');
  });

  it('delivered durumunu eşler', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 't', expires_in: 3600 });
    fetcher.setResponse('/api/v2/tracking/', 200, {
      trackingNumber: 'X',
      status: 'DELIVERED',
      events: [],
    });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const tracking = await provider.trackShipment('X');
    expect(tracking.status).toBe('delivered');
  });
});

describe('MngProvider — cancelShipment', () => {
  it('DELETE /shipments/{number}', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 't', expires_in: 3600 });
    fetcher.setResponse('/api/v2/shipments/MNG-123', 200, { success: true });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    await provider.cancelShipment('MNG-123');

    const delCall = fetcher.calls.find(
      (c) => c.url.includes('/api/v2/shipments/MNG-123') && c.init.method === 'DELETE',
    );
    expect(delCall).toBeDefined();
    expect(delCall!.init.headers['Authorization']).toBe('Bearer t');
  });

  it('success=false → exception', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 't', expires_in: 3600 });
    fetcher.setResponse('/api/v2/shipments/MNG-123', 200, {
      success: false,
      message: 'Kargoya verildi, iptal edilemez',
    });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    await expect(provider.cancelShipment('MNG-123')).rejects.toThrow(/iptal edilemez/);
  });
});

describe('MngProvider — token caching', () => {
  it('aynı tenant için tekrar istekte OAuth yeniden çağrılmaz (cache hit)', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, { access_token: 'cached-token', expires_in: 3600 });
    fetcher.setResponse('/api/v2/shipments', 201, { trackingNumber: 'MNG-1' });
    const provider = new MngProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    // İlk shipment → OAuth + shipment (2 call)
    await provider.createShipment(makeShipmentInput());
    // İkinci shipment → sadece shipment (cache hit, 1 call)
    await provider.createShipment(makeShipmentInput());

    const oauthCalls = fetcher.calls.filter((c) => c.url.includes('/oauth/token'));
    expect(oauthCalls).toHaveLength(1);
  });
});

describe('fetchMngAccessToken yardımcısı', () => {
  it('OAuth2 token alır', async () => {
    const fetcher = new MockFetcher();
    fetcher.setResponse('/oauth/token', 200, {
      access_token: 'helper-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
    const token = await fetchMngAccessToken('id', 'secret', 'https://api.test', fetcher.fetch.bind(fetcher));
    expect(token.access_token).toBe('helper-token');
    expect(token.token_type).toBe('Bearer');
    expect(token.expires_in).toBe(3600);
    expect(token.cachedAt).toBeGreaterThan(0);
  });
});