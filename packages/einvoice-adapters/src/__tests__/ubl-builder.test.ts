/**
 * UBL Builder birim testleri.
 */
import { describe, it, expect } from 'vitest';
import { buildInvoiceUbl, sha256Xml } from '../common/ubl-builder.js';
import type { CreateInvoiceRequest } from '../common/types.js';

const baseRequest: CreateInvoiceRequest = {
  tenantId: 'test-tenant',
  orderId: 'order-1',
  invoiceNumber: 'TRD-20260704-00001',
  type: 'e_fatura',
  currency: 'TRY',
  issueDate: new Date('2026-07-04T10:00:00Z'),
  seller: {
    taxId: '1234567890',
    taxOffice: 'Beyoğlu',
    legalName: 'Test Satıcı A.Ş.',
    tradeName: 'TestSatıcı',
    address: {
      street: 'İstiklal Caddesi No:1',
      city: 'İstanbul',
      district: 'Beyoğlu',
      postalCode: '34430',
      country: 'TR',
    },
    phone: '+902121234567',
    email: 'info@test.com',
    mersisNo: '0123456789012345',
  },
  buyer: {
    taxId: '9876543210',
    legalName: 'Test Alıcı Ltd.',
    address: {
      street: 'Atatürk Bulvarı No:50',
      city: 'Ankara',
      country: 'TR',
    },
  },
  lines: [
    {
      index: 1,
      name: 'Test Ürün',
      description: 'Açıklama',
      quantity: 2,
      unit: 'ADET',
      unitPrice: 100,
      taxRate: 20,
    },
    {
      index: 2,
      name: 'Test Ürün 2',
      quantity: 1,
      unit: 'KG',
      unitPrice: 50,
      taxRate: 10,
    },
  ],
};

describe('UBL Builder', () => {
  it('geçerli UBL XML üretir (e-fatura)', () => {
    const xml = buildInvoiceUbl(baseRequest);
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<Invoice');
    expect(xml).toContain('UBLVersionID>2.1');
    expect(xml).toContain('TRD-20260704-00001');
  });

  it('e-arşiv profilini doğru ayarlar', () => {
    const xml = buildInvoiceUbl({ ...baseRequest, type: 'e_arsiv' });
    expect(xml).toContain('EARSIVFATURA');
    expect(xml).toContain('EARSIV');
  });

  it('e-irsaliye için DespatchAdvice kullanır', () => {
    const xml = buildInvoiceUbl({ ...baseRequest, type: 'e_irsaliye' });
    expect(xml).toContain('<DespatchAdvice');
    expect(xml).toContain('SEVK');
  });

  it('Türkçe karakterleri XML escape eder', () => {
    const xml = buildInvoiceUbl(baseRequest);
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('İstiklal<');
  });

  it('vergi tutarlarını doğru hesaplar', () => {
    // 2 * 100 + 20% KDV = 240
    // 1 * 50 + 10% KDV = 55
    // Toplam: 295
    const xml = buildInvoiceUbl(baseRequest);
    expect(xml).toContain('200.0000'); // 2*100
    expect(xml).toContain('40.0000'); // KDV 1
    expect(xml).toContain('50.0000'); // 1*50
    expect(xml).toContain('5.0000'); // KDV 2
    expect(xml).toContain('295.0000'); // payable
  });

  it('SHA-256 hash 64 karakter hex döner', async () => {
    const xml = buildInvoiceUbl(baseRequest);
    const hash = await sha256Xml(xml);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('vergi numarası 11 haneli ise TCKN olarak işaretler', () => {
    const req: CreateInvoiceRequest = {
      ...baseRequest,
      buyer: {
        ...baseRequest.buyer,
        taxId: '12345678901', // 11 hane — TCKN
      },
    };
    const xml = buildInvoiceUbl(req);
    expect(xml).toContain('T.C. Kimlik Numarası');
  });

  it('vergi numarası 10 haneli ise VKN olarak işaretler', () => {
    const xml = buildInvoiceUbl(baseRequest);
    expect(xml).toContain('Vergi Kimlik Numarası');
  });

  it('currency exchange rate ekler (opsiyonel)', () => {
    const xml = buildInvoiceUbl({ ...baseRequest, exchangeRate: 32.5 });
    expect(xml).toContain('32.5');
    expect(xml).toContain('CalculationRate');
  });
});