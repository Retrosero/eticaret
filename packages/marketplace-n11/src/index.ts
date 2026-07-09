/**
 * N11 Pazaryeri Plugin.
 *
 * N11.com Marketplace API entegrasyonu.
 *
 * API Docs: https://developer.n11.com
 */
import type {
  MarketplaceAdapterPlugin,
  PluginContext,
  PluginManifest,
} from '@eticart/plugin-sdk';

const N11_API = {
  production: 'https://api.n11.com',
  staging: 'https://api-stg.n11.com',
} as const;

const manifest: PluginManifest = {
  code: 'eticart-plugin-n11',
  name: 'N11 Pazaryeri',
  description: 'N11.com pazaryerine otomatik ürün ve sipariş senkronizasyonu.',
  category: 'marketplace',
  version: '1.0.0',
  author: 'EtiCart',
  license: 'MIT',
  eticartVersion: '1.0.0',
  slug: 'n11',
  logoUrl: 'https://cdn.eticart.com.tr/plugins/n11.png',
  pricing: {
    monthlyKurus: 39900,
    yearlyKurus: 399000,
    hasTrial: true,
    minPlan: 'starter',
  },
  slots: [
    { type: 'marketplace.adapter', handler: 'adapter', priority: 10 },
  ],
  hooks: [
    { event: 'product.created', handler: 'onProductCreated', priority: 100 },
    { event: 'product.updated', handler: 'onProductUpdated', priority: 100 },
    { event: 'order.shipped', handler: 'onOrderShipped', priority: 100 },
  ],
  configSchema: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'apiSecret', label: 'API Secret', type: 'password', required: true },
    {
      key: 'env',
      label: 'Ortam',
      type: 'select',
      required: true,
      default: 'production',
      options: [
        { value: 'production', label: 'Production' },
        { value: 'staging', label: 'Staging' },
      ],
    },
  ],
  tags: ['pazaryeri', 'n11', 'entegrasyon'],
};

function getApiBase(config: Record<string, unknown>): string {
  const env = String(config['env'] ?? 'production');
  return N11_API[env as 'production' | 'staging'] ?? N11_API['production']!;
}

async function n11Request(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  config: Record<string, unknown>,
  body?: unknown,
  ctx?: PluginContext,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const base = getApiBase(config);
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        appKey: String(config['apiKey'] ?? ''),
        appSecret: String(config['apiSecret'] ?? ''),
        'Content-Type': 'application/json',
        'User-Agent': 'EtiCart-N11Plugin/1.0',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    ctx?.logger.error(`N11 API hatası: ${(err as Error).message}`);
    throw err;
  }
}

const adapter: MarketplaceAdapterPlugin = {
  manifest,
  async testConnection(ctx) {
    try {
      const res = await n11Request(
        'GET',
        '/rest/data/n11ProductService',
        ctx.config,
        undefined,
        ctx,
      );
      return {
        success: res.ok,
        message: res.ok
          ? 'N11 bağlantısı başarılı.'
          : `N11 bağlantısı başarısız: HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        success: false,
        message: `N11 bağlantı hatası: ${(err as Error).message}`,
      };
    }
  },
  async pushProduct(input, ctx) {
    const res = await n11Request(
      'POST',
      '/rest/data/n11ProductService',
      ctx.config,
      {
        product: {
          productSellerCode: input.sku,
          title: input.title,
          subtitle: input.description,
          brand: input.brand,
          categoryId: input.category,
          price: input.priceKurus / 100,
          stockAmount: input.stock,
          images: input.images,
        },
      },
      ctx,
    );
    if (!res.ok) {
      throw new Error(`N11 ürün gönderimi başarısız: ${JSON.stringify(res.data)}`);
    }
    const data = res.data as { productId?: string };
    return {
      platformProductId: data.productId ?? input.sku,
      url: `https://www.n11.com/urun/${input.sku}`,
    };
  },
  async updateStock(input, ctx) {
    await n11Request(
      'PUT',
      '/rest/data/n11ProductService',
      ctx.config,
      { productSellerCode: input.platformProductId, stockAmount: input.stock },
      ctx,
    );
  },
  async updatePrice(input, ctx) {
    await n11Request(
      'PUT',
      '/rest/data/n11ProductService',
      ctx.config,
      { productSellerCode: input.platformProductId, price: input.priceKurus / 100 },
      ctx,
    );
  },
  async fetchOrders(ctx) {
    const res = await n11Request(
      'GET',
      '/rest/data/n11OrderService',
      ctx.config,
      undefined,
      ctx,
    );
    if (!res.ok) return [];
    const data = res.data as {
      orders?: Array<{
        orderId: string;
        orderNumber: string;
        status: string;
        totalAmount: number;
        shippingAddress: { name: string; phone: string; address: string };
        items: Array<{ sellerCode: string; quantity: number; amount: number }>;
        createdAt: string;
      }>;
    };
    return (data.orders ?? []).map((o) => ({
      platformOrderId: o.orderId,
      orderNumber: o.orderNumber,
      status: o.status,
      totalKurus: Math.round(o.totalAmount * 100),
      customer: {
        name: o.shippingAddress.name,
        phone: o.shippingAddress.phone,
        address: o.shippingAddress.address,
      },
      items: o.items.map((i) => ({
        sku: i.sellerCode,
        quantity: i.quantity,
        priceKurus: Math.round(i.amount * 100),
      })),
      createdAt: o.createdAt,
    }));
  },
  async updateShipment(input, ctx) {
    await n11Request(
      'PUT',
      '/rest/data/n11OrderService',
      ctx.config,
      {
        orderId: input.platformOrderId,
        trackingNumber: input.trackingNumber,
        cargoProvider: input.cargoProvider,
      },
      ctx,
    );
  },
};

const handlers: any = {
  adapter,
  async onProductCreated(
    event: { data: { sku: string; priceKurus: number; stock: number; title: string; description: string; brand: string; category: string; images: string[] } },
    ctx: PluginContext,
  ) {
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
      ctx.logger.error(`N11 pushProduct hatası: ${(err as Error).message}`);
      return { continue: true };
    }
  },
  async onProductUpdated(
    event: { data: { sku: string; priceKurus?: number; stock?: number } },
    ctx: PluginContext,
  ) {
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
      ctx.logger.error(`N11 update hatası: ${(err as Error).message}`);
      return { continue: true };
    }
  },
  async onOrderShipped(
    event: { data: { orderNumber: string; trackingNumber: string; cargoProvider: string } },
    ctx: PluginContext,
  ) {
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
      ctx.logger.error(`N11 shipment hatası: ${(err as Error).message}`);
      return { continue: true };
    }
  },
};

export default handlers;
export { manifest, adapter };
