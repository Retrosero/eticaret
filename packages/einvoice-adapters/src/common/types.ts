/**
 * e-Fatura adaptörleri için ortak tip tanımları.
 *
 * Her adaptör (NES, Logo, Mikro, Foriba) bu interface'i imzalar.
 * `InvoiceService` adaptör seçimini `EInvoiceAdapterRegistry` üzerinden yapar.
 *
 * GİB uyumlu UBL 2.1 standardı baz alınmıştır. Adaptörler UBL XML'ini kendi
 * formatlarına dönüştürür (NES JSON+hash, Logo XML, Mikro XML vs.).
 */

/** Fatura türü. */
export type InvoiceType = 'e_fatura' | 'e_arsiv' | 'e_irsaliye';

/** Fatura durumu (GİB yanıt durumları). */
export type EInvoiceStatus =
  | 'not_required' // PDF (manuel) fatura — e-fatura gerektirmiyor
  | 'pending' // adaptöre gönderildi, yanıt bekleniyor
  | 'sent' // GİB'e gönderildi
  | 'accepted' // alıcı tarafından kabul edildi (e-fatura)
  | 'rejected' // reddedildi
  | 'cancelled' // iptal edildi
  | 'failed'; // gönderim hatası

/** Satır kalemi (ürün/hizmet). */
export interface InvoiceLine {
  /** Sıra numarası (1'den başlar). */
  index: number;
  /** Ürün/hizmet adı. */
  name: string;
  /** Açıklama (opsiyonel). */
  description?: string;
  /** Miktar. */
  quantity: number;
  /** Birim (adet, kg, m, vs.). */
  unit: string;
  /** Birim fiyat (KDV hariç). */
  unitPrice: number;
  /** KDV oranı (%). */
  taxRate: number;
  /** İskonto (yüzde veya sabit). */
  discountPercent?: number;
  discountAmount?: number;
}

/** Taraf bilgisi (satıcı veya alıcı). */
export interface PartyInfo {
  /** VKN (tüzel) veya TCKN (şahıs). */
  taxId: string;
  /** Vergi dairesi. */
  taxOffice?: string;
  /** Tam ünvan. */
  legalName: string;
  /** Kısa ünvan / marka. */
  tradeName?: string;
  /** Adres satırları. */
  address: {
    street: string;
    city: string;
    district?: string;
    postalCode?: string;
    country: string; // 'TR'
  };
  /** Telefon. */
  phone?: string;
  /** E-posta. */
  email?: string;
  /** Mersis no. */
  mersisNo?: string;
}

/** Fatura oluşturma isteği. */
export interface CreateInvoiceRequest {
  /** Tenant ID. */
  tenantId: string;
  /** Dahili sipariş ID. */
  orderId: string;
  /** Tenant-bazlı sıralı fatura numarası. */
  invoiceNumber: string;
  /** Fatura türü. */
  type: InvoiceType;
  /** Para birimi. */
  currency: string;
  /** Satıcı (kendi firmamız). */
  seller: PartyInfo;
  /** Alıcı (müşteri). */
  buyer: PartyInfo;
  /** Satır kalemleri. */
  lines: InvoiceLine[];
  /** Fatura tarihi (issue date). */
  issueDate: Date;
  /** Vade tarihi (B2B). */
  dueDate?: Date;
  /** Müşteri sipariş numarası (referans). */
  buyerOrderNumber?: string;
  /** Ek notlar. */
  notes?: string;
  /** Para birimi (kur bilgisi, opsiyonel). */
  exchangeRate?: number;
}

/** Fatura gönderim yanıtı. */
export interface CreateInvoiceResult {
  /** Adaptör tarafından atanan UUID (e-fatura için GİB UUID'si). */
  uuid: string;
  /** Fatura durumu. */
  status: EInvoiceStatus;
  /** GİB işlem zaman damgası. */
  processedAt?: Date;
  /** Hata varsa açıklama. */
  errorMessage?: string;
  /** PDF storage anahtarı (varsa). */
  pdfStorageKey?: string;
  /** Ham adaptör yanıtı (debug/log için). */
  rawResponse?: unknown;
}

/** Fatura iptal isteği. */
export interface CancelInvoiceRequest {
  uuid: string;
  reason: string;
  /** İptal tarihi. */
  cancelledAt: Date;
}

/** Fatura durum sorgulama sonucu. */
export interface InvoiceStatusResult {
  uuid: string;
  status: EInvoiceStatus;
  lastCheckedAt: Date;
  /** GİB yanıtı / referans. */
  gibReference?: string;
  /** Hata varsa. */
  errorMessage?: string;
}

/** Adaptör kimlik bilgileri (her provider farklı). */
export interface AdapterCredentials {
  /** API anahtarı / müşteri numarası. */
  apiKey: string;
  /** API parola / gizli anahtar. */
  apiSecret: string;
  /** Müşteri no (NES için). */
  customerId?: string;
  /** API base URL (sandbox/production). */
  baseUrl?: string;
  /** Test modu (sandbox). */
  testMode?: boolean;
  /** Mali mühür sertifikası (PEM, opsiyonel). */
  certificate?: string;
}

/**
 * e-Fatura adaptör sözleşmesi — her sağlayıcı bu interface'i imzalar.
 */
export interface EInvoiceAdapter {
  /** Adaptör adı ('nes', 'logo', 'mikro', 'foriba'). */
  readonly name: string;
  /** Görüntülenecek ad. */
  readonly displayName: string;

  /** Adaptörü yapılandır. */
  configure(credentials: AdapterCredentials): void;

  /** Fatura oluştur + GİB'e gönder. */
  createInvoice(req: CreateInvoiceRequest): Promise<CreateInvoiceResult>;

  /** Fatura durumunu sorgula. */
  getStatus(uuid: string): Promise<InvoiceStatusResult>;

  /** Faturayı iptal et. */
  cancelInvoice(req: CancelInvoiceRequest): Promise<{ success: boolean; errorMessage?: string }>;

  /** Fatura PDF'ini storage'a al (varsa). */
  downloadPdf(uuid: string): Promise<{ pdfBase64: string; filename: string }>;
}

/**
 * Adaptör kayıt defteri — runtime'da birden fazla adaptör birlikte çalışabilir.
 */
export class EInvoiceAdapterRegistry {
  private adapters = new Map<string, EInvoiceAdapter>();

  register(adapter: EInvoiceAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): EInvoiceAdapter | undefined {
    return this.adapters.get(name);
  }

  list(): EInvoiceAdapter[] {
    return Array.from(this.adapters.values());
  }

  has(name: string): boolean {
    return this.adapters.has(name);
  }
}