/**
 * Yurtiçi Kargo adaptörü birim testleri.
 *
 * Kapsam:
 *  - getRates desi + mesafe bazlı fiyat döner (iki hizmet seçeneği)
 *  - getRates ücretsiz kargo limiti kontrolü
 *  - getRates aynı şehir indirimi uygular
 *  - getRates COD ek ücreti ekler
 *  - createShipment SOAP createShipment çağrısı yapar, barkod URL'i döner
 *  - trackShipment durum bilgisi döner, SOAP fault durumunda exception
 *  - cancelShipment SOAP cancelShipment çağrısı yapar
 *  - init zorunlu alanları kontrol eder
 *  - Yardımcı: estimateYurticiDistance, calcYurticiDesi
 */

import { describe, it, expect } from 'vitest';

import {
  YurticiProvider,
  estimateYurticiDistance,
  calcYurticiDesi,
} from '../yurtici/index.js';
import type { Fetcher as IFetcher } from '../yurtici/index.js';
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
  apiKey: 'wsuser-1',
  apiSecret: 'wspassword-1',
  sandbox: true,
  extras: {
    customerCode: '12345',
    pricing: {
      perDesiMinor: 1500,
      perKmMinor: 5,
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
    destinationCity: 'Ankara',
    pkg: { weightGrams: 2000, desi: 3 },
    packageCount: 1,
    orderTotalMinor: 10000,
    ...overrides,
  };
}

function makeShipmentInput(overrides: Partial<ShipmentInput> = {}): ShipmentInput {
  return {
    tenantId: 'tenant-a',
    orderId: 'order-001',
    recipient: {
      fullName: 'Ali Veli',
      phone: '+905551234567',
      address: 'Kızılay Mah. Cumhuriyet Cd.',
      city: 'Ankara',
      district: 'Çankaya',
      postalCode: '06420',
    },
    pkg: { weightGrams: 1500, desi: 2 },
    packageCount: 1,
    notes: 'Kapıya bırakın',
    ...overrides,
  };
}

class MockFetcher implements IFetcher {
  public lastUrl = '';
  public lastBody = '';
  public lastHeaders: Record<string, string> = {};
  public responseStatus = 200;
  public responseBody = '';

  async fetch(url: string, init: { method: string; headers: Record<string, string>; body: string }) {
    this.lastUrl = url;
    this.lastBody = init.body;
    this.lastHeaders = init.headers;
    return { status: this.responseStatus, text: this.responseBody };
  }
}

/** SOAP başarılı yanıt üretici. */
function soapResponse(fields: Record<string, string>): string {
  const inner = Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Response>
      ${inner}
    </Response>
  </soap:Body>
</soap:Envelope>`;
}

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('YurticiProvider — init', () => {
  it('tenantId zorunlu', async () => {
    const p = new YurticiProvider({ fetcher: new MockFetcher().fetch.bind(new MockFetcher()) });
    await expect(p.init({ ...TEST_CFG, tenantId: '' })).rejects.toThrow(/tenantId/);
  });

  it('WS_USER zorunlu', async () => {
    const p = new YurticiProvider({ fetcher: new MockFetcher().fetch.bind(new MockFetcher()) });
    await expect(p.init({ ...TEST_CFG, apiKey: '' })).rejects.toThrow(/WS_USER/);
  });

  it('WS_PASSWORD zorunlu', async () => {
    const p = new YurticiProvider({ fetcher: new MockFetcher().fetch.bind(new MockFetcher()) });
    await expect(p.init({ ...TEST_CFG, apiSecret: '' })).rejects.toThrow(/WS_PASSWORD/);
  });
});

describe('YurticiProvider — getRates', () => {
  it('desi + mesafe bazlı fiyat hesaplar, iki hizmet seçeneği döner', async () => {
    const fetcher = new MockFetcher();
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const rates = await provider.getRates(makeRateInput({ orderTotalMinor: 10000 }));

    expect(rates).toHaveLength(2);
    expect(rates[0].serviceCode).toBe('YRT_STD');
    expect(rates[0].serviceName).toBe('Yurtiçi Standart');
    expect(rates[0].currency).toBe('TRY');
    expect(rates[0].estimatedDays).toBe(2);
    expect(rates[0].amountMinor).toBeGreaterThan(0);

    // Express = standart * 1.5
    expect(rates[1].serviceCode).toBe('YRT_EXP');
    expect(rates[1].estimatedDays).toBe(1);
    expect(rates[1].amountMinor).toBe(Math.round(rates[0].amountMinor * 1.5));
  });

  it('ücretsiz kargo limiti kontrolü', async () => {
    const fetcher = new MockFetcher();
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    // 500 TL üzeri sipariş → ücretsiz
    const rates = await provider.getRates(
      makeRateInput({ orderTotalMinor: 60000, originCity: 'İstanbul', destinationCity: 'Ankara' }),
    );
    expect(rates).toHaveLength(1);
    expect(rates[0].amountMinor).toBe(0);
    expect(rates[0].metadata?.['freeShipping']).toBe(true);
  });

  it('aynı şehir indirimi uygular', async () => {
    const fetcher = new MockFetcher();
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const ratesSame = await provider.getRates(
      makeRateInput({ originCity: 'İstanbul', destinationCity: 'İstanbul', orderTotalMinor: 10000 }),
    );
    const ratesCross = await provider.getRates(
      makeRateInput({ originCity: 'İstanbul', destinationCity: 'Ankara', orderTotalMinor: 10000 }),
    );
    // Aynı şehir mesafe = 0 km, indirimli fiyat
    expect(ratesSame[0].amountMinor).toBeLessThan(ratesCross[0].amountMinor);
    expect(ratesSame[0].metadata?.['sameCity']).toBe(true);
    expect(ratesCross[0].metadata?.['sameCity']).toBe(false);
  });

  it('COD ek ücreti ekler', async () => {
    const fetcher = new MockFetcher();
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const ratesNormal = await provider.getRates(makeRateInput({ metadata: {} }));
    const ratesCod = await provider.getRates(
      makeRateInput({ metadata: { cashOnDelivery: true } }),
    );
    expect(ratesCod[0].amountMinor).toBe(ratesNormal[0].amountMinor + 990);
  });

  it('çoklu paket sayısı çarpanı uygular', async () => {
    const fetcher = new MockFetcher();
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const rates1 = await provider.getRates(makeRateInput({ packageCount: 1 }));
    const rates3 = await provider.getRates(makeRateInput({ packageCount: 3 }));
    expect(rates3[0].amountMinor).toBe(rates1[0].amountMinor * 3);
  });

  it('desi hesabı metadata\'da döner', async () => {
    const fetcher = new MockFetcher();
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const rates = await provider.getRates(makeRateInput());
    expect(rates[0].metadata?.['desi']).toBe(3);
    expect(rates[0].metadata?.['distanceKm']).toBeGreaterThan(0);
  });
});

describe('YurticiProvider — createShipment', () => {
  it('SOAP createShipment çağrısı yapar, barkod URL\'i döner', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({
      trackingNumber: 'YK123456789',
      barcodeNumber: 'YK123456789',
      estimatedDelivery: '2026-07-05T00:00:00Z',
    });
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const shipment = await provider.createShipment(makeShipmentInput());

    // SOAP endpoint doğru
    expect(fetcher.lastUrl).toContain('yurticikargo.com.tr');
    expect(fetcher.lastHeaders['Content-Type']).toBe('text/xml; charset=utf-8');
    expect(fetcher.lastHeaders['SOAPAction']).toBe('http://yurticikargo.com.tr/createShipment');

    // SOAP body alanları
    expect(fetcher.lastBody).toContain('<wsUser>wsuser-1</wsUser>');
    expect(fetcher.lastBody).toContain('<wsPassword>wspassword-1</wsPassword>');
    expect(fetcher.lastBody).toContain('<customerCode>12345</customerCode>');
    expect(fetcher.lastBody).toContain('<receiverName>Ali Veli</receiverName>');
    expect(fetcher.lastBody).toContain('<receiverCity>Ankara</receiverCity>');
    expect(fetcher.lastBody).toContain('<desi>2</desi>');
    expect(fetcher.lastBody).toContain('<weight>2</weight>'); // 1500g → ceil(1.5) = 2

    // Dönen shipment
    expect(shipment.provider).toBe('yurtici');
    expect(shipment.trackingNumber).toBe('YK123456789');
    expect(shipment.barcodeUrl).toContain('YK123456789');
    expect(shipment.barcodeUrl).toContain('yurticikargo');
  });

  it('5xx yanıtta exception fırlatır', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseStatus = 503;
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    await expect(provider.createShipment(makeShipmentInput())).rejects.toThrow(/5xx yanıt/);
  });

  it('SOAP fault yanıtında hata fırlatır', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <soap:Fault>
          <faultstring>Geçersiz müşteri kodu</faultstring>
        </soap:Fault>
      </soap:Body>
    </soap:Envelope>`;
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    await expect(provider.createShipment(makeShipmentInput())).rejects.toThrow(
      /ayrıştırılamadı|Geçersiz/,
    );
  });
});

describe('YurticiProvider — trackShipment', () => {
  it('SOAP queryShipment çağrısı yapar, durum bilgisi döner', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({
      status: 'DAGITIMDA',
      location: 'Ankara Şubesi',
      description: 'Dağıtıma çıktı',
      estimatedDelivery: '2026-07-04T15:00:00Z',
    });
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const tracking = await provider.trackShipment('YK123456789');

    expect(fetcher.lastHeaders['SOAPAction']).toBe('http://yurticikargo.com.tr/queryShipment');
    expect(fetcher.lastBody).toContain('<trackingNumber>YK123456789</trackingNumber>');
    expect(tracking.trackingNumber).toBe('YK123456789');
    expect(tracking.status).toBe('out_for_delivery');
    expect(tracking.events.length).toBeGreaterThan(0);
    expect(tracking.events[0].description).toBe('Dağıtıma çıktı');
    expect(tracking.events[0].location).toBe('Ankara Şubesi');
  });

  it('delivered durumunu doğru eşler', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({ status: 'TESLIM' });
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    const tracking = await provider.trackShipment('YK123');
    expect(tracking.status).toBe('delivered');
  });
});

describe('YurticiProvider — cancelShipment', () => {
  it('SOAP cancelShipment çağrısı yapar', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({ result: 'OK' });
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    await provider.cancelShipment('YK123456789');

    expect(fetcher.lastHeaders['SOAPAction']).toBe('http://yurticikargo.com.tr/cancelShipment');
    expect(fetcher.lastBody).toContain('<trackingNumber>YK123456789</trackingNumber>');
  });

  it('SOAP fault hatası fırlatır', async () => {
    const fetcher = new MockFetcher();
    fetcher.responseBody = soapResponse({
      errorMessage: 'Gönderi çoktan yola çıkmış',
    });
    const provider = new YurticiProvider({ fetcher: fetcher.fetch.bind(fetcher) });
    await provider.init(TEST_CFG);

    await expect(provider.cancelShipment('YK123')).rejects.toThrow(/Gönderi çoktan yola çıkmış/);
  });
});

describe('Yardımcı fonksiyonlar', () => {
  it('estimateYurticiDistance — aynı şehir 0 km', () => {
    expect(estimateYurticiDistance('İstanbul', 'İstanbul')).toBe(0);
  });

  it('estimateYurticiDistance — farklı şehirler arası mesafe > 0', () => {
    const d = estimateYurticiDistance('İstanbul', 'Ankara');
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(600);
  });

  it('estimateYurticiDistance — bilinmeyen şehir fallback 500 km', () => {
    expect(estimateYurticiDistance('XYZ Şehri', 'QWE Şehri')).toBe(500);
  });

  it('calcYurticiDesi — desi > 0 ise döndür', () => {
    expect(calcYurticiDesi({ weightGrams: 1000, desi: 5 })).toBe(5);
  });

  it('calcYurticiDesi — boyutlardan hesapla', () => {
    expect(
      calcYurticiDesi({ weightGrams: 1000, desi: 0, widthCm: 30, heightCm: 20, lengthCm: 15 }),
    ).toBe(3); // 30*20*15/3000 = 3
  });

  it('calcYurticiDesi — boyut yoksa 1', () => {
    expect(calcYurticiDesi({ weightGrams: 1000, desi: 0 })).toBe(1);
  });
});