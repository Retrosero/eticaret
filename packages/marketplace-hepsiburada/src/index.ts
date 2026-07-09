/**
 * Hepsiburada Pazaryeri Plugin.
 *
 * Hepsiburada Marketplace API entegrasyonu.
 *
 * API Docs: https://developer.hepsiburada.com
 */
import type {
  MarketplaceAdapterPlugin,
  PluginContext,
  PluginManifest,
} from '@eticart/plugin-sdk';

const HEPSIBURADA_API = {
  production: 'https://api.hepsiburada.com',
  staging: 'https://api-stg.hepsiburada.com',
} as const;

const manifest: PluginManifest = {
  code: 'eticart-plugin-hepsiburada',
  name: 'Hepsiburada Pazaryeri',
  description:
    'Hepsiburada pazaryerine otomatik ürün, stok, fiyat ve sipariş senkronizasyonu.',
  category: 'marketplace',
  version: '1.0.0',
  author: 'EtiCart',
  license: 'MIT',
  eticartVersion: '1.0.0',
  slug: 'hepsiburada',
  logoUrl: 'https://cdn.eticart.com.tr/plugins/hepsiburada.png',
  pricing: {
    monthlyKurus: 49900,
    yearlyKurus: 499000,
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
    { key: 'username', label: 'API Kullanıcı Adı', type: 'text', required: true },
    { key: 'password', label: 'API Şifre', type: 'password', required: true },
    { key: 'merchantId', label: 'Merchant ID', type: 'text', required: true },
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
  tags: ['pazaryeri', 'hepsiburada', 'entegrasyon'],
};

function getAuthHeader(config: Record<string, unknown>): string {
  const u = String(config['username'] ?? '');
  const p = String(config['password'] ?? '');
  return `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
}

function getApiBase(config: Record<string, unknown>): string {
  const env = String(config['env'] ?? 'production');
  return HEPSIBURADA_API[env as 'production' | 'staging'] ?? HEPSIBURADA_API['production']!;
}

async function hbRequest(
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
        Authorization: getAuthHeader(config),
        'Content-Type': 'application/json',
        'User-Agent': 'EtiCart-HepsiburadaPlugin/1.0',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    ctx?.logger.error(`Hepsiburada API hatası: ${(err as Error).message}`);
    throw err;
  }
}

const adapter: MarketplaceAdapterPlugin = {
  manifest,
  async testConnection(ctx) {
    try {
      const merchantId = String(ctx.config['merchantId'] ?? '');
      const res = await hbRequest(
        'GET',
        `/product/api/products/merchantid/${merchantId}`,
        ctx.config,
        undefined,
        ctx,
      );
      return {
        success: res.ok,
        sellerId: merchantId,
        message: res.ok
          ? 'Hepsiburada bağlantısı başarılı.'
          : `Hepsiburada bağlantısı başarısız: HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        success: false,
        message: `Hepsiburada bağlantı hatası: ${(err as Error).message}`,
      };
    }
  },
  async pushProduct(input, ctx) {
    const merchantId = String(ctx.config['merchantId'] ?? '');
    const res = await hbRequest(
      'POST',
      `/product/api/products/merchantid/${merchantId}`,
      ctx.config,
      {
        merchantSku: input.sku,
        barcode: input.barcode ?? input.sku,
        title: input.title,
        description: input.description,
        brand: input.brand,
        categoryId: input.category,
        price: input.priceKurus / 100,
        stockAmount: input.stock,
        images: input.images.map((url) => ({ url })),
      },
      ctx,
    );
    if (!res.ok) {
      throw new Error(`Hepsiburada ürün gönderimi başarısız: ${JSON.stringify(res.data)}`);
    }
    const data = res.data as { productId?: string };
    return {
      platformProductId: data.productId ?? input.sku,
      url: `https://www.hepsiburada.com/urun/${input.sku}`,
    };
  },
  async updateStock(input, ctx) {
    const merchantId = String(ctx.config['merchantId'] ?? '');
    await hbRequest(
      'PUT',
      `/product/api/products/merchantid/${merchantId}/stock`,
      ctx.config,
      {
        merchantSku: input.platformProductId,
        stockAmount: input.stock,
      },
      ctx,
    );
  },
  async updatePrice(input, ctx) {
    const merchantId = String(ctx.config['merchantId'] ?? '');
    await hbRequest(
      'PUT',
      `/product/api/products/merchantid/${merchantId}/price`,
      ctx.config,
      {
        merchantSku: input.platformProductId,
        price: input.priceKurus / 100,
      },
      ctx,
    );
  },
  async fetchOrders(ctx) {
    const merchantId = String(ctx.config['merchantId'] ?? '');
    const res = await hbRequest(
      'GET',
      `/order/api/orders/merchantid/${merchantId}/status/created`,
      ctx.config,
      undefined,
      ctx,
    );
    if (!res.ok) return [];
    const data = res.data as {
      items?: Array<{
        orderId: string;
        merchantOrderId: string;
        orderStatus: string;
        totalAmount: number;
        shippingAddress: { name: string; phone: string; address: string };
        lines: Array<{ merchantSku: string; quantity: number; amount: number }>;
        createdAt: string;
      }>;
    };
    return (data.items ?? []).map((o) => ({
      platformOrderId: o.merchantOrderId,
      orderNumber: o.orderId,
      status: o.orderStatus,
      totalKurus: Math.round(o.totalAmount * 100),
      customer: {
        name: o.shippingAddress.name,
        phone: o.shippingAddress.phone,
        address: o.shippingAddress.address,
      },
      items: o.lines.map((l) => ({
        sku: l.merchantSku,
        quantity: l.quantity,
        priceKurus: Math.round(l.amount * 100),
      })),
      createdAt: o.createdAt,
    }));
  },
  async updateShipment(input, ctx) {
    const merchantId = String(ctx.config['merchantId'] ?? '');
    await hbRequest(
      'PUT',
      `/order/api/orders/merchantid/${merchantId}/shipment`,
      ctx.config,
      {
        merchantOrderId: input.platformOrderId,
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
      ctx.logger.error(`Hepsiburada pushProduct hatası: ${(err as Error).message}`);
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
      ctx.logger.error(`Hepsiburada update hatası: ${(err as Error).message}`);
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
      ctx.logger.error(`Hepsiburada shipment hatası: ${(err as Error).message}`);
      return { continue: true };
    }
  },
};

export default handlers;
export { manifest, adapter };
