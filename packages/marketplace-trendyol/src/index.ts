/**
 * Trendyol Pazaryeri Plugin.
 *
 * Trendyol Marketplace API entegrasyonu.
 *   - Ürün senkronizasyonu (push)
 *   - Sipariş çekme (pull)
 *   - Stok/fiyat güncelleme
 *   - Kargo bildirimi
 *
 * Konfigürasyon:
 *   - apiKey: Trendyol API key
 *   - apiSecret: API secret
 *   - sellerId: Satıcı ID
 *   - merchantId: Merchant ID
 *   - env: 'production' | 'staging'
 *
 * API Docs: https://developer.trendyol.com
 */
import type {
  MarketplaceAdapterPlugin,
  PluginContext,
  PluginManifest,
} from '@eticart/plugin-sdk';

const TRENDYOL_API = {
  production: 'https://api.trendyol.com/sapigw',
  staging: 'https://stageapi.trendyol.com/sapigw',
} as const;

const manifest: PluginManifest = {
  code: 'eticart-plugin-trendyol',
  name: 'Trendyol Pazaryeri',
  description: 'Trendyol pazaryerine otomatik ürün, stok, fiyat ve sipariş senkronizasyonu.',
  category: 'marketplace',
  version: '1.0.0',
  author: 'EtiCart',
  license: 'MIT',
  eticartVersion: '1.0.0',
  slug: 'trendyol',
  logoUrl: 'https://cdn.eticart.com.tr/plugins/trendyol.png',
  pricing: {
    monthlyKurus: 49900,
    yearlyKurus: 499000,
    hasTrial: true,
    minPlan: 'starter',
  },
  slots: [
    {
      type: 'marketplace.adapter',
      handler: 'adapter',
      priority: 10,
    },
  ],
  hooks: [
    {
      event: 'product.created',
      handler: 'onProductCreated',
      priority: 100,
    },
    {
      event: 'product.updated',
      handler: 'onProductUpdated',
      priority: 100,
    },
    {
      event: 'order.shipped',
      handler: 'onOrderShipped',
      priority: 100,
    },
  ],
  configSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Trendyol entegrasyon panelinden alın.',
    },
    {
      key: 'apiSecret',
      label: 'API Secret',
      type: 'password',
      required: true,
    },
    {
      key: 'sellerId',
      label: 'Seller ID',
      type: 'text',
      required: true,
    },
    {
      key: 'merchantId',
      label: 'Merchant ID',
      type: 'text',
      required: true,
    },
    {
      key: 'env',
      label: 'Ortam',
      type: 'select',
      required: true,
      default: 'production',
      options: [
        { value: 'production', label: 'Production (Canlı)' },
        { value: 'staging', label: 'Staging (Test)' },
      ],
    },
  ],
  tags: ['pazaryeri', 'trendyol', 'entegrasyon', 'çoklu-kanal'],
};

/** Auth header oluştur (Basic Auth). */
function getAuthHeader(config: Record<string, unknown>): string {
  const apiKey = String(config['apiKey'] ?? '');
  const apiSecret = String(config['apiSecret'] ?? '');
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  return `Basic ${credentials}`;
}

function getApiBase(config: Record<string, unknown>): string {
  const env = String(config['env'] ?? 'production');
  return TRENDYOL_API[env as 'production' | 'staging'] ?? TRENDYOL_API['production']!;
}

/** API çağrısı. */
async function trendyolRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  config: Record<string, unknown>,
  body?: unknown,
  ctx?: PluginContext,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const base = getApiBase(config);
  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    Authorization: getAuthHeader(config),
    'Content-Type': 'application/json',
    'User-Agent': 'EtiCart-TrendyolPlugin/1.0',
  };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    ctx?.logger.error(`Trendyol API hatası: ${(err as Error).message}`);
    throw err;
  }
}

const adapter: MarketplaceAdapterPlugin = {
  manifest,

  async testConnection(ctx) {
    try {
      const sellerId = String(ctx.config['sellerId'] ?? '');
      const res = await trendyolRequest(
        'GET',
        `/suppliers/${sellerId}/products`,
        ctx.config,
        undefined,
        ctx,
      );
      if (res.ok) {
        return {
          success: true,
          sellerId,
          message: 'Trendyol bağlantısı başarılı.',
        };
      }
      return {
        success: false,
        message: `Trendyol bağlantısı başarısız: HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        success: false,
        message: `Trendyol bağlantı hatası: ${(err as Error).message}`,
      };
    }
  },

  async pushProduct(input, ctx) {
    const sellerId = String(ctx.config['sellerId'] ?? '');
    const res = await trendyolRequest(
      'POST',
      `/suppliers/${sellerId}/products`,
      ctx.config,
      {
        items: [
          {
            barcode: input.barcode ?? input.sku,
            title: input.title,
            productMainId: input.sku,
            brandId: Number(input.brand) || 0,
            categoryId: Number(input.category) || 0,
            quantity: input.stock,
            stockCode: input.sku,
            dimensionalWeight: 0,
            description: input.description,
            currencyType: 'TRY',
            amount: input.priceKurus / 100,
            sku: input.sku,
            images: input.images.map((url) => ({ url })),
          },
        ],
      },
      ctx,
    );

    if (!res.ok) {
      throw new Error(
        `Trendyol ürün gönderimi başarısız: ${JSON.stringify(res.data)}`,
      );
    }
    const data = res.data as { batchRequestId?: string };
    return {
      platformProductId: data.batchRequestId ?? input.sku,
      url: `https://www.trendyol.com/seller/urun/${input.sku}`,
    };
  },

  async updateStock(input, ctx) {
    const sellerId = String(ctx.config['sellerId'] ?? '');
    await trendyolRequest(
      'PUT',
      `/suppliers/${sellerId}/products/price-and-inventory`,
      ctx.config,
      {
        items: [
          {
            barcode: input.platformProductId,
            quantity: input.stock,
          },
        ],
      },
      ctx,
    );
  },

  async updatePrice(input, ctx) {
    const sellerId = String(ctx.config['sellerId'] ?? '');
    await trendyolRequest(
      'PUT',
      `/suppliers/${sellerId}/products/price-and-inventory`,
      ctx.config,
      {
        items: [
          {
            barcode: input.platformProductId,
            amount: input.priceKurus / 100,
          },
        ],
      },
      ctx,
    );
  },

  async fetchOrders(ctx) {
    const sellerId = String(ctx.config['sellerId'] ?? '');
    const res = await trendyolRequest(
      'GET',
      `/suppliers/${sellerId}/orders`,
      ctx.config,
      undefined,
      ctx,
    );
    if (!res.ok) return [];
    const data = res.data as {
      content?: Array<{
        orderNumber: string;
        orderCode: string;
        status: string;
        totalPrice: number;
        shipmentAddress: {
          firstName: string;
          lastName: string;
          phone: string;
          fullAddress: string;
        };
        lines: Array<{
          productName: string;
          quantity: number;
          amount: number;
          sku?: string;
        }>;
        orderDate: string;
      }>;
    };
    return (data.content ?? []).map((o) => ({
      platformOrderId: o.orderCode,
      orderNumber: o.orderNumber,
      status: o.status,
      totalKurus: Math.round(o.totalPrice * 100),
      customer: {
        name: `${o.shipmentAddress.firstName} ${o.shipmentAddress.lastName}`,
        phone: o.shipmentAddress.phone,
        address: o.shipmentAddress.fullAddress,
      },
      items: o.lines.map((l) => ({
        sku: l.sku ?? '',
        quantity: l.quantity,
        priceKurus: Math.round(l.amount * 100),
      })),
      createdAt: o.orderDate,
    }));
  },

  async updateShipment(input, ctx) {
    const sellerId = String(ctx.config['sellerId'] ?? '');
    await trendyolRequest(
      'PUT',
      `/suppliers/${sellerId}/shipments`,
      ctx.config,
      {
        shipment: {
          orderCode: input.platformOrderId,
          trackingNumber: input.trackingNumber,
          cargoProvider: input.cargoProvider,
        },
      },
      ctx,
    );
  },
};

/** Hook handler'ları. */
const handlers: any = {
  adapter,
  async onProductCreated(event: { data: { sku: string; priceKurus: number; stock: number; title: string; description: string; brand: string; category: string; images: string[] } }, ctx: PluginContext) {
    try {
      await adapter.pushProduct(
        {
          sku: event.data.sku,
          title: event.data.title,
          description: event.data.description,
          priceKurus: event.data.priceKurus,
          stock: event.data.stock,
          images: event.data.images,
          category: event.data.category,
          brand: event.data.brand,
        },
        ctx,
      );
      return { continue: true };
    } catch (err) {
      ctx.logger.error(
        `Trendyol pushProduct hook hatası: ${(err as Error).message}`,
      );
      return { continue: true, error: (err as Error).message };
    }
  },
  async onProductUpdated(event: { data: { sku: string; priceKurus?: number; stock?: number } }, ctx: PluginContext) {
    try {
      if (event.data.stock !== undefined) {
        await adapter.updateStock(
          { platformProductId: event.data.sku, stock: event.data.stock },
          ctx,
        );
      }
      if (event.data.priceKurus !== undefined) {
        await adapter.updatePrice(
          { platformProductId: event.data.sku, priceKurus: event.data.priceKurus },
          ctx,
        );
      }
      return { continue: true };
    } catch (err) {
      ctx.logger.error(
        `Trendyol update hook hatası: ${(err as Error).message}`,
      );
      return { continue: true };
    }
  },
  async onOrderShipped(event: { data: { orderNumber: string; trackingNumber: string; cargoProvider: string } }, ctx: PluginContext) {
    try {
      await adapter.updateShipment(
        {
          platformOrderId: event.data.orderNumber,
          trackingNumber: event.data.trackingNumber,
          cargoProvider: event.data.cargoProvider,
        },
        ctx,
      );
      return { continue: true };
    } catch (err) {
      ctx.logger.error(
        `Trendyol shipment hook hatası: ${(err as Error).message}`,
      );
      return { continue: true };
    }
  },
};

export default handlers;
export { manifest, adapter };
export type { PluginManifest, MarketplaceAdapterPlugin };
