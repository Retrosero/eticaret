/**
 * Plugin SDK — Type definitions.
 *
 * Plugin manifest, slot tipleri, hook event'leri.
 */

/** Plugin manifest (package.json'da `eticart` alanı). */
export interface PluginManifest {
  /** Plugin benzersiz kodu: "eticart-plugin-trendyol" */
  code: string;
  /** Görünen ad: "Trendyol Pazaryeri" */
  name: string;
  /** Kısa açıklama */
  description: string;
  /** Kategori: marketplace, payment, shipping, integration */
  category: PluginCategory;
  /** Versiyon: semver */
  version: string;
  /** Yazar */
  author: string;
  /** Lisans */
  license: string;
  /** Minimum Eticart versiyonu */
  eticartVersion: string;
  /** Slug (subdomain-friendly) */
  slug: string;
  /** Logo URL */
  logoUrl?: string;
  /** Marketplace'te gösterilecek ekran görüntüleri */
  screenshots?: string[];
  /** Plan bazlı fiyatlandırma (null = ücretsiz) */
  pricing?: PluginPricing | null;
  /** Plugin'in doldurduğu slot'lar */
  slots: PluginSlot[];
  /** Plugin'in dinlediği hook'lar */
  hooks?: PluginHook[];
  /** Tenant bazlı konfigürasyon şeması */
  configSchema?: PluginConfigField[];
  /** Marketplace tags */
  tags?: string[];
}

export type PluginCategory =
  | 'marketplace'
  | 'payment'
  | 'shipping'
  | 'integration'
  | 'analytics'
  | 'marketing'
  | 'utility';

export interface PluginPricing {
  /** Aylık fiyat kuruş (TRY) */
  monthlyKurus: number;
  /** Yıllık fiyat kuruş */
  yearlyKurus: number;
  /** 14 günlük trial var mı */
  hasTrial: boolean;
  /** Plan gereksinimi: "starter" | "growth" | "business" | "enterprise" */
  minPlan?: 'starter' | 'growth' | 'business' | 'enterprise';
}

export interface PluginSlot {
  /** Slot tipi */
  type: PluginSlotType;
  /** Handler fonksiyonun adı (plugin içinde export edilen) */
  handler: string;
  /** Öncelik (düşük = önce çalışır) */
  priority?: number;
  /** Metadata */
  meta?: Record<string, unknown>;
}

export type PluginSlotType =
  /** Ödeme gateway'i ekle (iyzico, PayTR, vb.) */
  | 'payment.gateway'
  /** Kargo firması ekle */
  | 'shipping.carrier'
  /** Pazaryeri adaptörü ekle */
  | 'marketplace.adapter'
  /** Bildirim kanalı ekle (SMS, push) */
  | 'notification.channel'
  /** Admin sayfası ekle */
  | 'admin.page'
  /** Storefront sayfası ekle */
  | 'storefront.page'
  /** API endpoint ekle */
  | 'api.endpoint'
  /** Webhook receiver */
  | 'webhook.receiver';

export interface PluginHook {
  /** Hook adı: "order.created", "customer.registered" */
  event: string;
  /** Handler fonksiyonun adı */
  handler: string;
  /** Öncelik */
  priority?: number;
}

/** Plugin config field — admin panel'de form olarak gösterilir. */
export interface PluginConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'boolean' | 'select' | 'textarea';
  required: boolean;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
  helpText?: string;
  placeholder?: string;
}

/** Plugin runtime context — her plugin call'da geçilir. */
export interface PluginContext {
  tenantId: string;
  pluginInstallId: string;
  config: Record<string, unknown>;
  logger: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
  /** DB erişimi (tenant-scoped) */
  db?: unknown;
  /** HTTP client (rate-limited, retry) */
  http?: unknown;
  /** Config (env-based) */
  env?: Record<string, string>;
}

/** Hook event payload. */
export interface HookEvent<T = unknown> {
  event: string;
  tenantId: string;
  data: T;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** Hook handler result. */
export interface HookResult {
  /** İşlem devam etsin mi */
  continue: boolean;
  /** Değiştirilmiş data (varsa) */
  data?: unknown;
  /** Hata varsa */
  error?: string;
}

/** Payment gateway plugin interface. */
export interface PaymentGatewayPlugin {
  manifest: PluginManifest;
  /** Ödeme başlat */
  createPayment(input: {
    amountKurus: number;
    currency: string;
    orderId: string;
    customerEmail: string;
    customerName: string;
    returnUrl: string;
    cancelUrl: string;
  }, ctx: PluginContext): Promise<{
    paymentId: string;
    redirectUrl: string;
    status: 'pending' | 'completed' | 'failed';
  }>;
  /** Webhook doğrula */
  verifyWebhook(input: {
    body: string;
    signature?: string;
    headers: Record<string, string>;
  }, ctx: PluginContext): Promise<{
    verified: boolean;
    paymentId?: string;
    status?: 'success' | 'failure';
  }>;
  /** Ödeme durumu sorgula */
  getPaymentStatus(paymentId: string, ctx: PluginContext): Promise<{
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    amountKurus: number;
  }>;
}

/** Marketplace adapter plugin interface. */
export interface MarketplaceAdapterPlugin {
  manifest: PluginManifest;
  /** API bağlantısı test et */
  testConnection(ctx: PluginContext): Promise<{
    success: boolean;
    sellerId?: string;
    message: string;
  }>;
  /** Ürün senkronize et (push) */
  pushProduct(input: {
    sku: string;
    title: string;
    description: string;
    priceKurus: number;
    stock: number;
    images: string[];
    category: string;
    brand: string;
    barcode?: string;
  }, ctx: PluginContext): Promise<{
    platformProductId: string;
    url: string;
  }>;
  /** Stok güncelle */
  updateStock(input: {
    platformProductId: string;
    stock: number;
  }, ctx: PluginContext): Promise<void>;
  /** Fiyat güncelle */
  updatePrice(input: {
    platformProductId: string;
    priceKurus: number;
  }, ctx: PluginContext): Promise<void>;
  /** Siparişleri çek (pull) */
  fetchOrders(ctx: PluginContext): Promise<Array<{
    platformOrderId: string;
    orderNumber: string;
    status: string;
    totalKurus: number;
    customer: { name: string; phone: string; address: string };
    items: Array<{ sku: string; quantity: number; priceKurus: number }>;
    createdAt: string;
  }>>;
  /** Kargo bilgisi güncelle */
  updateShipment(input: {
    platformOrderId: string;
    trackingNumber: string;
    cargoProvider: string;
  }, ctx: PluginContext): Promise<void>;
}

/** Shipping carrier plugin interface. */
export interface ShippingCarrierPlugin {
  manifest: PluginManifest;
  /** Kargo ücreti hesapla */
  calculateRate(input: {
    fromCity: string;
    toCity: string;
    weightKg: number;
    desi: number;
  }, ctx: PluginContext): Promise<{
    costKurus: number;
    estimatedDays: number;
    serviceName: string;
  }>;
  /** Kargo oluştur */
  createShipment(input: {
    orderNumber: string;
    sender: { name: string; phone: string; address: string };
    receiver: { name: string; phone: string; address: string };
    items: Array<{ description: string; quantity: number; weightKg: number }>;
  }, ctx: PluginContext): Promise<{
    trackingNumber: string;
    labelUrl: string;
  }>;
  /** Kargo durumu sorgula */
  trackShipment(trackingNumber: string, ctx: PluginContext): Promise<{
    status: 'created' | 'in_transit' | 'delivered' | 'returned';
    events: Array<{ date: string; status: string; location: string }>;
  }>;
}
