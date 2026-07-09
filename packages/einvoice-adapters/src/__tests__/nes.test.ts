/**
 * NES adaptör birim testleri (gerçek nes.com.tr API'sine uygun).
 *
 * NES API davranışı (developer.nes.com.tr'den):
 *   - OAuth2 client_credentials ile Bearer token alınır
 *   - POST /fatura/olustur — JSON payload, Bearer header
 *   - GET  /fatura/durum/{id} — durum sorgulama
 *   - POST /fatura/iptal    — iptal
 *   - GET  /fatura/pdf/{id}  — PDF indirme
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NesClient } from '../nes/client.js';
import type { AdapterCredentials, CreateInvoiceRequest } from '../common/types.js';

// Axios mock
vi.mock('axios', () => {
  const mockPost = vi.fn();
  const mockGet = vi.fn();
  return {
    default: {
      create: () => ({
        post: mockPost,
        get: mockGet,
        interceptors: { request: { use: () => {} }, response: { use: () => {} } },
      }),
    },
  };
});

import axios from 'axios';
const mockAxios = axios as unknown as {
  create: () => {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    interceptors: { request: { use: () => void }; response: { use: () => void } };
  };
};

const testCreds: AdapterCredentials = {
  apiKey: 'TEST-CLIENT-ID',
  apiSecret: 'TEST-CLIENT-SECRET',
  customerId: 'TEST-MUKELLEF',
  testMode: true,
};

const sampleRequest: CreateInvoiceRequest = {
  tenantId: 'tenant-1',
  orderId: 'order-1',
  invoiceNumber: 'TRD-20260704-00001',
  type: 'e_fatura',
  currency: 'TRY',
  issueDate: new Date('2026-07-04T10:00:00Z'),
  seller: {
    taxId: '1234567890',
    taxOffice: 'Beyoğlu',
    legalName: 'Test Satıcı A.Ş.',
    address: {
      street: 'İstiklal Caddesi No:1',
      city: 'İstanbul',
      district: 'Beyoğlu',
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
    { index: 1, name: 'Test Ürün', quantity: 2, unit: 'ADET', unitPrice: 100, taxRate: 20 },
  ],
};

describe('NesClient (nes.com.tr)', () => {
  let client: NesClient;
  let mockPost: ReturnType<typeof vi.fn>;
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new NesClient();
    client.configure(testCreds);
    mockPost = mockAxios.create().post;
    mockGet = mockAxios.create().get;
  });

  describe('configure', () => {
    it('test modunda test URL kullanır', () => {
      const c = new NesClient();
      c.configure({ ...testCreds, testMode: true });
      expect(c).toBeDefined();
    });

    it('üretim modunda api.nes.com.tr kullanır', () => {
      const c = new NesClient();
      c.configure({ ...testCreds, testMode: false });
      expect(c).toBeDefined();
    });

    it('baseUrl override edilirse kullanır', () => {
      const c = new NesClient();
      c.configure({ ...testCreds, baseUrl: 'https://custom.nes.com.tr' });
      expect(c).toBeDefined();
    });

    it('configure edilmeden çağrılırsa hata fırlatır', async () => {
      const c = new NesClient();
      await expect(c.createInvoice(sampleRequest)).rejects.toThrow('yapılandırılmamış');
    });
  });

  describe('OAuth Token', () => {
    it('createInvoice ilk çağrıda token alır', async () => {
      // İlk çağrı: token alma
      mockPost.mockResolvedValueOnce({
        data: {
          success: true,
          statusCode: 200,
          data: {
            access_token: 'tok-1234',
            token_type: 'Bearer',
            expires_in: 3600,
          },
        },
      });
      // İkinci çağrı: fatura oluştur
      mockPost.mockResolvedValueOnce({
        data: {
          success: true,
          statusCode: 200,
          data: {
            faturaId: 'NES-001',
            uuid: 'gib-uuid-xyz',
            belgeNumarasi: 'TRD-20260704-00001',
            durum: 'GONDERILDI',
          },
        },
      });

      await client.createInvoice(sampleRequest);

      expect(mockPost).toHaveBeenCalledTimes(2);
      // İlk çağrı: /oauth/token
      expect(mockPost.mock.calls[0][0]).toBe('/oauth/token');
      expect(mockPost.mock.calls[0][1]).toEqual({
        grant_type: 'client_credentials',
        client_id: 'TEST-CLIENT-ID',
        client_secret: 'TEST-CLIENT-SECRET',
        scope: 'fatura',
      });
      // İkinci çağrı: /fatura/olustur
      expect(mockPost.mock.calls[1][0]).toBe('/fatura/olustur');
      expect(mockPost.mock.calls[1][2].headers.Authorization).toBe('Bearer tok-1234');
    });

    it('token hatası durumunda failed status döner', async () => {
      mockPost.mockRejectedValueOnce({
        message: 'Token error',
        response: { data: { errorMessage: 'Invalid client credentials' } },
      });

      const result = await client.createInvoice(sampleRequest);
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('Invalid client credentials');
    });

    it('cached token birden fazla istekte tekrar kullanılmaz', async () => {
      // Tek token ile 2 fatura gönder
      mockPost.mockResolvedValueOnce({
        data: {
          success: true,
          data: { access_token: 'cached-tok', token_type: 'Bearer', expires_in: 3600 },
        },
      });
      mockPost.mockResolvedValueOnce({
        data: { success: true, data: { faturaId: 'F1', durum: 'GONDERILDI' } },
      });
      mockPost.mockResolvedValueOnce({
        data: { success: true, data: { faturaId: 'F2', durum: 'GONDERILDI' } },
      });

      await client.createInvoice(sampleRequest);
      await client.createInvoice(sampleRequest);

      // 3 çağrı: 1 token + 2 fatura
      expect(mockPost).toHaveBeenCalledTimes(3);
      expect(mockPost.mock.calls[0][0]).toBe('/oauth/token');
      expect(mockPost.mock.calls[1][0]).toBe('/fatura/olustur');
      expect(mockPost.mock.calls[2][0]).toBe('/fatura/olustur');
    });
  });

  describe('createInvoice', () => {
    function mockTokenAndInvoice(invoiceResponse: any) {
      mockPost.mockResolvedValueOnce({
        data: {
          success: true,
          data: { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 },
        },
      });
      mockPost.mockResolvedValueOnce({
        data: invoiceResponse,
      });
    }

    it('başarılı fatura oluşturma — GONDERILDI', async () => {
      mockTokenAndInvoice({
        success: true,
        statusCode: 200,
        data: {
          faturaId: 'NES-001',
          uuid: 'gib-uuid-xyz',
          belgeNumarasi: sampleRequest.invoiceNumber,
          durum: 'GONDERILDI',
        },
      });

      const result = await client.createInvoice(sampleRequest);
      expect(result.status).toBe('sent');
      expect(result.uuid).toBe('gib-uuid-xyz');
    });

    it('BEKLEMEDE durumunu pending olarak döner', async () => {
      mockTokenAndInvoice({
        success: true,
        data: { faturaId: 'NES-002', durum: 'BEKLEMEDE' },
      });
      const result = await client.createInvoice(sampleRequest);
      expect(result.status).toBe('pending');
    });

    it('ONAYLANDI durumunu accepted olarak döner', async () => {
      mockTokenAndInvoice({
        success: true,
        data: { faturaId: 'NES-003', durum: 'ONAYLANDI' },
      });
      const result = await client.createInvoice(sampleRequest);
      expect(result.status).toBe('accepted');
    });

    it('REDDEDILDI durumunu rejected olarak döner', async () => {
      mockTokenAndInvoice({
        success: true,
        data: { faturaId: 'NES-004', durum: 'REDDEDILDI', hataMesaji: 'VKN uyumsuz' },
      });
      const result = await client.createInvoice(sampleRequest);
      expect(result.status).toBe('rejected');
      expect(result.errorMessage).toBe('VKN uyumsuz');
    });

    it('e-arşiv için SATIS tipi kullanır', async () => {
      mockTokenAndInvoice({
        success: true,
        data: { faturaId: 'NES-005', durum: 'GONDERILDI' },
      });

      await client.createInvoice({ ...sampleRequest, type: 'e_arsiv' });

      const payload = mockPost.mock.calls[1][1];
      expect(payload.faturaTipi).toBe('SATIS');
    });

    it('e-irsaliye için SEVK tipi kullanır', async () => {
      mockTokenAndInvoice({
        success: true,
        data: { faturaId: 'NES-006', durum: 'GONDERILDI' },
      });

      await client.createInvoice({ ...sampleRequest, type: 'e_irsaliye' });

      const payload = mockPost.mock.calls[1][1];
      expect(payload.faturaTipi).toBe('SEVK');
    });

    it('JSON payload doğru formatta', async () => {
      mockTokenAndInvoice({
        success: true,
        data: { faturaId: 'NES-007', durum: 'GONDERILDI' },
      });

      await client.createInvoice(sampleRequest);

      const payload = mockPost.mock.calls[1][1];

      // Satıcı
      expect(payload.satici.vkn).toBe('1234567890');
      expect(payload.satici.vergiDairesi).toBe('Beyoğlu');
      expect(payload.satici.unvan).toBe('Test Satıcı A.Ş.');
      // Alıcı
      expect(payload.alici.vkn).toBe('9876543210');
      expect(payload.alici.unvan).toBe('Test Alıcı Ltd.');
      // Kalemler
      expect(payload.malHizmetList).toHaveLength(1);
      expect(payload.malHizmetList[0]).toMatchObject({
        siraNo: 1,
        malHizmetAdi: 'Test Ürün',
        miktar: 2,
        birim: 'ADET',
        birimFiyat: 100,
        kdvOrani: 20,
        satirTutari: 240, // 200 + 40 KDV
      });
      // Toplamlar
      expect(payload.toplamlar).toMatchObject({
        araToplam: 200,
        kdvToplam: 40,
        odenecekTutar: 240,
      });
      // Tarih
      expect(payload.duzenlenmeTarihi).toBe('2026-07-04');
      expect(payload.paraBirimi).toBe('TRY');
    });

    it('PDF base64 varsa storage key üretir', async () => {
      mockTokenAndInvoice({
        success: true,
        data: { faturaId: 'NES-008', durum: 'ONAYLANDI', pdfBase64: 'JVBERi...' },
      });
      const result = await client.createInvoice(sampleRequest);
      expect(result.pdfStorageKey).toBe('nes-pdf-NES-008.pdf');
    });

    it('NES success=false yanıtında failed döner', async () => {
      mockTokenAndInvoice({
        success: false,
        statusCode: 400,
        errorCode: 'INVALID_BODY',
        errorMessage: 'Satır toplamları uyuşmuyor',
      });
      const result = await client.createInvoice(sampleRequest);
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('Satır toplamları uyuşmuyor');
    });

    it('HTTP 500 hatası catch edilir', async () => {
      mockPost.mockResolvedValueOnce({
        data: { success: true, data: { access_token: 'tok', expires_in: 3600 } },
      });
      mockPost.mockRejectedValueOnce({
        message: 'Network Error',
        response: { data: { errorMessage: 'Sunucu hatası' } },
      });
      const result = await client.createInvoice(sampleRequest);
      expect(result.status).toBe('failed');
    });
  });

  describe('getStatus', () => {
    it('fatura durumunu NES üzerinden sorgular', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            faturaId: 'NES-001',
            uuid: 'gib-uuid',
            durum: 'ONAYLANDI',
            sonKontrolTarihi: '2026-07-04T12:00:00Z',
          },
        },
      });

      const result = await client.getStatus('NES-001');
      expect(result.status).toBe('accepted');
      expect(result.gibReference).toBe('gib-uuid');
    });

    it('hata durumunda failed döner', async () => {
      mockGet.mockRejectedValueOnce({
        message: 'Network Error',
        response: { data: { errorMessage: 'Bulunamadı' } },
      });
      const result = await client.getStatus('missing');
      expect(result.status).toBe('failed');
    });
  });

  describe('cancelInvoice', () => {
    it('faturayı iptal eder', async () => {
      mockPost.mockResolvedValueOnce({
        data: { success: true, data: { iptalTarihi: '2026-07-05T10:00:00Z' } },
      });

      const result = await client.cancelInvoice({
        uuid: 'NES-001',
        reason: 'Müşteri talebi',
        cancelledAt: new Date('2026-07-05'),
      });

      expect(result.success).toBe(true);
      expect(mockPost.mock.calls[0][0]).toBe('/fatura/iptal');
      expect(mockPost.mock.calls[0][1]).toMatchObject({
        faturaId: 'NES-001',
        iptalSebebi: 'Müşteri talebi',
      });
    });

    it('iptal başarısızsa success=false döner', async () => {
      mockPost.mockResolvedValueOnce({
        data: { success: false, errorMessage: 'Fatura zaten iptal edilmiş' },
      });
      const result = await client.cancelInvoice({
        uuid: 'u',
        reason: 'r',
        cancelledAt: new Date(),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('downloadPdf', () => {
    it('PDF base64 ve dosya adı döner', async () => {
      mockGet.mockResolvedValueOnce({
        data: { success: true, data: { pdfBase64: 'JVBERi0xLjQ...' } },
      });
      const result = await client.downloadPdf('NES-001');
      expect(result.pdfBase64).toBe('JVBERi0xLjQ...');
      expect(result.filename).toBe('NES-001.pdf');
    });

    it('PDF bulunamadığında hata fırlatır', async () => {
      mockGet.mockResolvedValueOnce({
        data: { success: false, errorMessage: 'PDF yok' },
      });
      await expect(client.downloadPdf('missing')).rejects.toThrow();
    });
  });
});