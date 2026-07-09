/**
 * Gittigidiyor Pazaryeri Plugin.
 *
 * Gittigidiyor (eBay Turkey) Marketplace API entegrasyonu.
 * - Ürün senkronizasyonu (create/update)
 * - Sipariş çekme (pull)
 * - Stok/fiyat güncelleme
 * - Kargo bildirimi
 *
 * Konfigürasyon:
 *   - apiKey: Gittigidiyor API key
 *   - apiSecret: API secret
 *   - sellerId: Satıcı ID
 *   - env: 'production' | 'staging'
 *
 * API Docs: https://developer.gittigidiyor.com
 */
import type {
  MarketplaceAdapterPlugin,
  PluginContext,
  PluginManifest,
} from '@eticart/plugin-sdk';

const GG_API = {
  production: 'https://api.gittigidiyor.com',
  staging: 'https://dev-api.gittigidiyor.com',
} as const;

const manifest: PluginManifest = {
  code: 'eticart-plugin-gittigidiyor',
  name: 'Gittigidiyor Pazaryeri',
  description: 'Gittigidiyor pazaryerine otomatik ürün, stok, fiyat ve sipariş senkronizasyonu.',
  category: 'marketplace',
  version: '1.0.0',
  author: 'EtiCart',
  license: 'MIT',
  eticartVersion: '1.0.0',
  slug: 'gittigidiyor',
  logoUrl: 'https://cdn.eticart.com.tr/plugins/gittigidiyor.png',
  tags: ['pazaryeri', 'gittigidiyor', 'turkiye', 'ebay'],
  pricing: {
    monthlyKurus: 19900,
    yearlyKurus: 199000,
    hasTrial: true,
  },
  slots: [
    {
      type: 'marketplace.adapter',
      handler: 'adapter',
      priority: 10,
      meta: { marketplace: 'gittigidiyor', country: 'TR' },
    },
  ],
  hooks: [
    { event: 'product.created', handler: 'onProductCreated' },
    { event: 'product.updated', handler: 'onProductUpdated' },
    { event: 'order.shipped', handler: 'onOrderShipped' },
  ],
};

function basicAuth(cfg: Record<string, unknown>): string {
  const key = String(cfg['apiKey'] ?? '');
  const secret = String(cfg['apiSecret'] ?? '');
  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
}

function ggBaseUrl(cfg: Record<string, unknown>): string {
  const env = (cfg['env'] as 'production' | 'staging') ?? 'production';
  return GG_API[env];
}

const adapter: MarketplaceAdapterPlugin = {
  manifest,
  async testConnection(ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    if (!cfg['apiKey'] || !cfg['apiSecret'] || !cfg['sellerId']) {
      return { success: false, message: 'Eksik API kimlik bilgileri.' };
    }
    try {
      const res = await fetch(`${ggBaseUrl(cfg)}/auth/check`, {
        headers: { Authorization: basicAuth(cfg) },
      });
      if (res.ok) return { success: true, sellerId: String(cfg['sellerId']), message: 'Gittigidiyor bağlantısı başarılı.' };
      return { success: false, message: `API ${res.status}` };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  },

  async pushProduct(input, ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    try {
      const res = await fetch(`${ggBaseUrl(cfg)}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basicAuth(cfg),
        },
        body: JSON.stringify({
          productId: input.sku,
          title: input.title,
          description: input.description,
          price: { amount: input.priceKurus / 100, currency: 'TRY' },
          stockQuantity: input.stock,
          images: input.images,
          categoryId: input.category,
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const result = (await res.json()) as { productId?: string };
      return {
        platformProductId: result.productId ?? input.sku,
        url: `https://www.gittigidiyor.com/${result.productId ?? input.sku}`,
      };
    } catch (err) {
      throw new Error(`Gittigidiyor pushProduct failed: ${(err as Error).message}`);
    }
  },

  async updateStock(input, ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    const res = await fetch(`${ggBaseUrl(cfg)}/products/${input.platformProductId}/stock`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuth(cfg),
      },
      body: JSON.stringify({ stockQuantity: input.stock }),
    });
    if (!res.ok) throw new Error(`Stock update failed: API ${res.status}`);
  },

  async updatePrice(input, ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    const res = await fetch(`${ggBaseUrl(cfg)}/products/${input.platformProductId}/price`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuth(cfg),
      },
      body: JSON.stringify({ price: { amount: input.priceKurus / 100, currency: 'TRY' } }),
    });
    if (!res.ok) throw new Error(`Price update failed: API ${res.status}`);
  },

  async fetchOrders(ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    try {
      const res = await fetch(`${ggBaseUrl(cfg)}/orders`, {
        headers: { Authorization: basicAuth(cfg) },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        orders?: Array<{
          orderId: string;
          orderNumber: string;
          buyer: { name: string; phone?: string; address?: string };
          totalAmount: number;
          items: Array<{ productId: string; quantity: number; amount: number }>;
          createdAt: string;
          status?: string;
        }>;
      };
      return (data.orders ?? []).map((o) => ({
        platformOrderId: o.orderId,
        orderNumber: o.orderNumber,
        status: o.status ?? 'new',
        totalKurus: Math.round(o.totalAmount * 100),
        customer: {
          name: o.buyer.name,
          phone: o.buyer.phone ?? '',
          address: o.buyer.address ?? '',
        },
        items: o.items.map((i) => ({
          sku: i.productId,
          quantity: i.quantity,
          priceKurus: Math.round(i.amount * 100),
        })),
        createdAt: o.createdAt,
      }));
    } catch {
      return [];
    }
  },

  async updateShipment(input, ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    const res = await fetch(`${ggBaseUrl(cfg)}/orders/${input.platformOrderId}/shipment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuth(cfg),
      },
      body: JSON.stringify({
        cargoCompany: input.cargoProvider,
        trackingNumber: input.trackingNumber,
      }),
    });
    if (!res.ok) throw new Error(`Shipment update failed: API ${res.status}`);
  },
};

const handlers = {
  adapter,
  async onProductCreated(_ctx: PluginContext, product: { sku: string }): Promise<void> {
    console.log(`[Gittigidiyor] Yeni ürün: ${product.sku}`);
  },
  async onProductUpdated(_ctx: PluginContext, product: { sku: string }): Promise<void> {
    console.log(`[Gittigidiyor] Ürün güncellendi: ${product.sku}`);
  },
  async onOrderShipped(_ctx: PluginContext, order: { orderId: string }): Promise<void> {
    console.log(`[Gittigidiyor] Sipariş kargoya verildi: ${order.orderId}`);
  },
};

export { manifest, handlers };
export default handlers;