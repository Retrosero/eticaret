/**
 * NES (nes.com.tr) e-Fatura / e-Arşiv / e-İrsaliye adaptörü.
 *
 * NES, Türkiye'nin GİB onaylı özel entegratör firmalarından biridir.
 * 130.000+ işletme tarafından kullanılır. REST API + Bearer token kullanır.
 *
 * Referanslar:
 *   - Web sitesi:     https://nes.com.tr
 *   - Geliştirici:    https://developer.nes.com.tr (API dokümantasyonu)
 *   - API base URL:   https://api.nes.com.tr (production)
 *                     https://api-test.nes.com.tr (sandbox)
 *
 * Desteklenen belgeler:
 *   - e-Fatura (SATIS, IADE, ISTISNA, OZELMATRAH, TEVKIFAT, IHRACKAYITLI)
 *   - e-Arşiv Fatura
 *   - e-İrsaliye (SEVK, IADE)
 *   - e-SMM (Serbest Meslek Makbuzu)
 *   - e-MM (Müstahsil Makbuzu)
 *
 * Ödeme yöntemi: Bearer Token (OAuth2 client_credentials veya API key)
 */
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { createLogger } from '@eticart/config';
import {
  type AdapterCredentials,
  type CreateInvoiceRequest,
  type CreateInvoiceResult,
  type CancelInvoiceRequest,
  type InvoiceStatusResult,
  type EInvoiceAdapter,
} from '../common/types.js';

const log = createLogger({ service: 'einvoice-adapters/nes' });

const NES_PROD_URL = 'https://api.nes.com.tr';
const NES_TEST_URL = 'https://api-test.nes.com.tr';

// ---------------------------------------------------------------------------
// NES API Yanıt Tipleri
// ---------------------------------------------------------------------------

/** NES API yanıt zarfı. */
interface NesApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message?: string;
  /** Hata varsa açıklama. */
  errorCode?: string;
  errorMessage?: string;
  data?: T;
}

/** Token yanıtı. */
interface NesTokenData {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number; // saniye
  refresh_token?: string;
}

/** Fatura oluşturma yanıtı. */
interface NesCreateInvoiceData {
  /** NES tarafından atanan fatura ID. */
  faturaId: string;
  /** GİB UUID. */
  uuid?: string;
  /** Belge numarası (örn: ABC2026000000001). */
  belgeNumarasi?: string;
  /** Fatura durumu. */
  durum: 'BEKLEMEDE' | 'GONDERILDI' | 'ONAYLANDI' | 'REDDEDILDI' | 'IPTAL' | 'HATA';
  /** Hata varsa. */
  hataMesaji?: string;
  /** PDF base64 (opsiyonel). */
  pdfBase64?: string;
  /** HTML önizleme. */
  htmlOnizleme?: string;
}

/** Durum sorgulama yanıtı. */
interface NesStatusData {
  faturaId: string;
  uuid?: string;
  durum: string;
  gonderimTarihi?: string;
  sonKontrolTarihi?: string;
  hataMesaji?: string;
}

/** İptal yanıtı. */
interface NesCancelData {
  success: boolean;
  iptalTarihi?: string;
  hataMesaji?: string;
}

// ---------------------------------------------------------------------------
// NES Belge Tipleri (faturaTipi)
// ---------------------------------------------------------------------------

/** NES'in kabul ettiği fatura tipleri. */
export type NesFaturaTipi =
  | 'SATIS' // Satış faturası
  | 'IADE' // İade faturası
  | 'ISTISNA' // İstisna (KDV muaf)
  | 'OZELMATRAH' // Özel matrah
  | 'TEVKIFAT' // Tevkifatlı
  | 'IHRACKAYITLI' // İhraç kayıtlı
  | 'SEVK' // İrsaliye (sevk)
  | 'IADE_IRSALIYE'; // İrsaliye iade

// ---------------------------------------------------------------------------
// İstemci
// ---------------------------------------------------------------------------

export class NesClient implements EInvoiceAdapter {
  readonly name = 'nes';
  readonly displayName = 'NES (nes.com.tr)';

  private http!: AxiosInstance;
  private credentials: AdapterCredentials | null = null;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  configure(credentials: AdapterCredentials): void {
    this.credentials = credentials;

    const baseUrl =
      credentials.baseUrl ??
      (credentials.testMode ? NES_TEST_URL : NES_PROD_URL);

    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    log.info(
      {
        baseUrl,
        testMode: credentials.testMode ?? false,
        customerId: credentials.customerId,
      },
      'NES adaptörü yapılandırıldı',
    );
  }

  // ---------------------------------------------------------------------------
  // Fatura Oluşturma
  // ---------------------------------------------------------------------------

  /**
   * e-Fatura / e-Arşiv / e-İrsaliye oluşturur ve GİB'e gönderir.
   *
   * NES API akışı:
   * 1. Bearer token al (cache'li, süresi dolmadan yeniden alınmaz)
   * 2. POST /fatura/olustur — JSON payload
   * 3. Yanıt: { faturaId, uuid, durum, pdfBase64? }
   */
  async createInvoice(req: CreateInvoiceRequest): Promise<CreateInvoiceResult> {
    this.ensureConfigured();

    const payload = this.buildCreatePayload(req);

    log.debug(
      {
        tenantId: req.tenantId,
        invoiceNumber: req.invoiceNumber,
        type: req.type,
        vergiNo: req.seller.taxId,
      },
      'NES: Fatura gönderiliyor',
    );

    try {
      const token = await this.getAccessToken();
      const { data } = await this.http.post<NesApiResponse<NesCreateInvoiceData>>(
        '/fatura/olustur',
        payload,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!data.success || !data.data) {
        return {
          uuid: '',
          status: 'failed',
          errorMessage: data.errorMessage ?? data.message ?? 'NES yanıtı başarısız',
          rawResponse: data,
        };
      }

      const nesStatus = this.mapNesStatus(data.data.durum);

      return {
        uuid: data.data.uuid ?? data.data.faturaId,
        status: nesStatus,
        processedAt: new Date(),
        pdfStorageKey: data.data.pdfBase64
          ? `nes-pdf-${data.data.faturaId}.pdf`
          : undefined,
        errorMessage: data.data.hataMesaji,
        rawResponse: data,
      };
    } catch (err: any) {
      log.error(
        { err: err?.message, invoiceNumber: req.invoiceNumber },
        'NES: Fatura gönderim hatası',
      );
      return {
        uuid: '',
        status: 'failed',
        errorMessage: this.extractErrorMessage(err),
        rawResponse: err?.response?.data,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Durum Sorgulama
  // ---------------------------------------------------------------------------

  async getStatus(uuid: string): Promise<InvoiceStatusResult> {
    this.ensureConfigured();

    try {
      const token = await this.getAccessToken();
      const { data } = await this.http.get<NesApiResponse<NesStatusData>>(
        `/fatura/durum/${encodeURIComponent(uuid)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!data.success || !data.data) {
        return {
          uuid,
          status: 'failed',
          lastCheckedAt: new Date(),
          errorMessage: data.errorMessage ?? data.message,
        };
      }

      return {
        uuid,
        status: this.mapNesStatus(data.data.durum),
        lastCheckedAt: new Date(data.data.sonKontrolTarihi ?? Date.now()),
        gibReference: data.data.uuid,
        errorMessage: data.data.hataMesaji,
      };
    } catch (err: any) {
      return {
        uuid,
        status: 'failed',
        lastCheckedAt: new Date(),
        errorMessage: this.extractErrorMessage(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // İptal
  // ---------------------------------------------------------------------------

  async cancelInvoice(
    req: CancelInvoiceRequest,
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureConfigured();

    try {
      const token = await this.getAccessToken();
      const { data } = await this.http.post<NesApiResponse<NesCancelData>>(
        `/fatura/iptal`,
        {
          faturaId: req.uuid,
          iptalSebebi: req.reason,
          iptalTarihi: req.cancelledAt.toISOString(),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!data.success) {
        return { success: false, errorMessage: data.errorMessage ?? data.message };
      }

      // log.info({ uuid: req.uuid }, 'NES: Fatura iptal edildi');
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        errorMessage: this.extractErrorMessage(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // PDF İndirme
  // ---------------------------------------------------------------------------

  async downloadPdf(uuid: string): Promise<{ pdfBase64: string; filename: string }> {
    this.ensureConfigured();

    const token = await this.getAccessToken();
    const { data } = await this.http.get<NesApiResponse<{ pdfBase64: string }>>(
      `/fatura/pdf/${encodeURIComponent(uuid)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!data.success || !data.data?.pdfBase64) {
      throw new Error('PDF bulunamadı');
    }

    return {
      pdfBase64: data.data.pdfBase64,
      filename: `${uuid}.pdf`,
    };
  }

  // ===========================================================================
  // Dahili Yardımcılar
  // ===========================================================================

  /**
   * Access token al — cache'li (expires_in'den önce yeniden istenmez).
   */
  private async getAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('NES adaptörü yapılandırılmamış');
    }

    // Cache'de geçerli token varsa onu kullan (5 dakika marjla)
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
      return this.cachedToken.token;
    }

    const { data } = await this.http.post<NesApiResponse<NesTokenData>>(
      '/oauth/token',
      {
        grant_type: 'client_credentials',
        client_id: this.credentials.apiKey,
        client_secret: this.credentials.apiSecret,
        scope: 'fatura',
      },
    );

    if (!data.success || !data.data?.access_token) {
      throw new Error(
        `NES token alınamadı: ${data.errorMessage ?? data.message ?? 'bilinmeyen hata'}`,
      );
    }

    this.cachedToken = {
      token: data.data.access_token,
      expiresAt: Date.now() + data.data.expires_in * 1000,
    };

    return data.data.access_token;
  }

  /**
   * NES API'nin beklediği JSON payload'ı oluşturur.
   */
  private buildCreatePayload(req: CreateInvoiceRequest): Record<string, unknown> {
    // Fatura tipi dönüşümü
    const faturaTipi = this.mapInvoiceType(req.type);

    // Satır toplamları
    const malHizmetList = req.lines.map((line, idx) => {
      const lineSubtotal = line.quantity * line.unitPrice;
      const taxAmount = lineSubtotal * (line.taxRate / 100);
      return {
        siraNo: idx + 1,
        malHizmetAdi: line.name,
        miktar: line.quantity,
        birim: line.unit,
        birimFiyat: line.unitPrice,
        kdvOrani: line.taxRate,
        kdvTutari: this.round2(taxAmount),
        satirTutari: this.round2(lineSubtotal + taxAmount),
        aciklama: line.description,
      };
    });

    // Toplamlar
    const toplamlar = this.calculateTotals(req.lines);

    return {
      faturaTipi,
      belgeNumarasi: req.invoiceNumber,
      duzenlenmeTarihi: req.issueDate.toISOString().slice(0, 10),
      duzenlenmeSaati: req.issueDate.toISOString().slice(11, 19),
      paraBirimi: req.currency,
      dovizKuru: req.exchangeRate,

      // Satıcı (biz)
      satici: {
        vkn: req.seller.taxId,
        vergiDairesi: req.seller.taxOffice,
        unvan: req.seller.legalName,
        adres: this.formatAddress(req.seller.address),
        telefon: req.seller.phone,
        eposta: req.seller.email,
        mersisNo: req.seller.mersisNo,
      },

      // Alıcı (müşteri)
      alici: {
        vkn: req.buyer.taxId,
        vergiDairesi: req.buyer.taxOffice,
        unvan: req.buyer.legalName,
        adres: this.formatAddress(req.buyer.address),
        telefon: req.buyer.phone,
        eposta: req.buyer.email,
      },

      // Kalemler
      malHizmetList,

      // Toplamlar
      toplamlar,

      // Ek bilgiler
      notlar: req.notes,
      siparisNo: req.buyerOrderNumber,
      vadeTarihi: req.dueDate?.toISOString().slice(0, 10),
    };
  }

  /**
   * Adres nesnesini NES formatına dönüştürür.
   */
  private formatAddress(addr: { street: string; city: string; district?: string; postalCode?: string; country: string }): string {
    const parts = [
      addr.street,
      addr.district,
      `${addr.city}${addr.postalCode ? ' ' + addr.postalCode : ''}`,
      addr.country === 'TR' ? 'Türkiye' : addr.country,
    ].filter(Boolean);
    return parts.join(' / ');
  }

  /**
   * Satır tutarlarından toplamları hesaplar.
   */
  private calculateTotals(lines: CreateInvoiceRequest['lines']): Record<string, number> {
    let araToplam = 0;
    let kdvToplam = 0;

    for (const line of lines) {
      const lineSubtotal = line.quantity * line.unitPrice;
      const lineTax = lineSubtotal * (line.taxRate / 100);
      araToplam += lineSubtotal;
      kdvToplam += lineTax;
    }

    const odenecekTutar = araToplam + kdvToplam;

    return {
      araToplam: this.round2(araToplam),
      kdvToplam: this.round2(kdvToplam),
      iskontoToplam: 0,
      odenecekTutar: this.round2(odenecekTutar),
    };
  }

  /**
   * 2 ondalık basamağa yuvarla.
   */
  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Bizim `InvoiceType` → NES `faturaTipi`.
   */
  private mapInvoiceType(type: CreateInvoiceRequest['type']): NesFaturaTipi {
    switch (type) {
      case 'e_fatura':
        return 'SATIS';
      case 'e_arsiv':
        return 'SATIS'; // e-Arşiv tipi genelde aynı, farklı header'da işaretlenir
      case 'e_irsaliye':
        return 'SEVK';
      default:
        return 'SATIS';
    }
  }

  /**
   * NES durum → bizim EInvoiceStatus.
   */
  private mapNesStatus(nesDurum: string): CreateInvoiceResult['status'] {
    switch (nesDurum) {
      case 'BEKLEMEDE':
        return 'pending';
      case 'GONDERILDI':
        return 'sent';
      case 'ONAYLANDI':
        return 'accepted';
      case 'REDDEDILDI':
        return 'rejected';
      case 'IPTAL':
        return 'cancelled';
      case 'HATA':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Axios hatasından anlamlı mesaj çıkar.
   */
  private extractErrorMessage(err: any): string {
    if (err?.response?.data?.errorMessage) return err.response.data.errorMessage;
    if (err?.response?.data?.message) return err.response.data.message;
    if (err?.message) return err.message;
    return 'Bilinmeyen NES hatası';
  }

  private ensureConfigured(): void {
    if (!this.credentials || !this.http) {
      throw new Error('NES adaptörü yapılandırılmamış. Önce configure() çağırın.');
    }
  }
}