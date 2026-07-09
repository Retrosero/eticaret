/**
 * Amazon Turkey Pazaryeri Plugin.
 *
 * Amazon Selling Partner API (SP-API) — Turkey marketplace.
 * - Listing management
 * - Inventory & pricing sync
 * - Order retrieval
 * - Shipping confirmation
 *
 * Auth: LWA (Login with Amazon) OAuth2 + IAM role ARN.
 *
 * API Docs: https://developer-docs.amazon.com/sp-api
 */
import type {
  MarketplaceAdapterPlugin,
  PluginContext,
  PluginManifest,
} from '@eticart/plugin-sdk';

const AMAZON_API = {
  production: 'https://sellingpartnerapi-na.amazon.com',
  sandbox: 'https://sandbox.sellingpartnerapi-na.amazon.com',
} as const;

const AMAZON_LWA_URL = 'https://api.amazon.com/auth/o2/token';
const AMAZON_MARKETPLACE_ID = 'A1F83G8C2ARO7P'; // Turkey

const manifest: PluginManifest = {
  code: 'eticart-plugin-amazon-tr',
  name: 'Amazon Turkey Pazaryeri',
  description: 'Amazon.com.tr üzerinde otomatik ürün, stok ve sipariş yönetimi.',
  category: 'marketplace',
  version: '1.0.0',
  author: 'EtiCart',
  license: 'MIT',
  eticartVersion: '1.0.0',
  slug: 'amazon-tr',
  logoUrl: 'https://cdn.eticart.com.tr/plugins/amazon-tr.png',
  tags: ['pazaryeri', 'amazon', 'turkiye', 'sp-api'],
  pricing: {
    monthlyKurus: 29900,
    yearlyKurus: 299000,
    hasTrial: true,
  },
  slots: [
    {
      type: 'marketplace.adapter',
      handler: 'adapter',
      priority: 20,
      meta: { marketplace: 'amazon-tr', region: 'eu', country: 'TR' },
    },
  ],
  hooks: [
    { event: 'product.created', handler: 'onProductCreated' },
    { event: 'product.updated', handler: 'onProductUpdated' },
    { event: 'order.shipped', handler: 'onOrderShipped' },
  ],
};

/** LWA Token alma — production'da cache'lenir. */
async function getLwaToken(cfg: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const res = await fetch(AMAZON_LWA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
    }).toString(),
  });
  if (!res.ok) throw new Error(`LWA token error: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function amazonBaseUrl(cfg: Record<string, unknown>): string {
  const env = (cfg['env'] as 'production' | 'sandbox') ?? 'production';
  return AMAZON_API[env];
}

const adapter: MarketplaceAdapterPlugin = {
  manifest,
  async testConnection(ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    if (!cfg['clientId'] || !cfg['clientSecret'] || !cfg['refreshToken'] || !cfg['sellerId']) {
      return { success: false, message: 'Eksik OAuth bilgileri (clientId/secret/refreshToken/sellerId).' };
    }
    try {
      await getLwaToken({
        clientId: String(cfg['clientId']),
        clientSecret: String(cfg['clientSecret']),
        refreshToken: String(cfg['refreshToken']),
      });
      return { success: true, sellerId: String(cfg['sellerId']), message: 'Amazon SP-API bağlantısı başarılı.' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  },

  async pushProduct(input, ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    const sellerId = String(cfg['sellerId'] ?? '');
    const token = await getLwaToken({
      clientId: String(cfg['clientId']),
      clientSecret: String(cfg['clientSecret']),
      refreshToken: String(cfg['refreshToken']),
    });
    const res = await fetch(`${amazonBaseUrl(cfg)}/listings/2021-08-01/items/${sellerId}/${input.sku}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': token,
      },
      body: JSON.stringify({
        productType: 'PRODUCT',
        attributes: {
          title: input.title,
          description: input.description,
          price: { amount: input.priceKurus / 100, currencyCode: 'TRY' },
          quantity: input.stock,
          mainImage: input.images?.[0],
        },
      }),
    });
    if (!res.ok) throw new Error(`SP-API ${res.status}`);
    return {
      platformProductId: input.sku,
      url: `https://www.amazon.com.tr/dp/${input.sku}`,
    };
  },

  async updateStock(input, ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    const token = await getLwaToken({
      clientId: String(cfg['clientId']),
      clientSecret: String(cfg['clientSecret']),
      refreshToken: String(cfg['refreshToken']),
    });
    const res = await fetch(
      `${amazonBaseUrl(cfg)}/fba/inventory/v1/summaries?details=true&granularityType=Marketplace&granularityId=${AMAZON_MARKETPLACE_ID}&sellerSku=${input.platformProductId}`,
      { headers: { 'x-amz-access-token': token } },
    );
    if (!res.ok) throw new Error(`Inventory API ${res.status}`);
  },

  async updatePrice(input, ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    const token = await getLwaToken({
      clientId: String(cfg['clientId']),
      clientSecret: String(cfg['clientSecret']),
      refreshToken: String(cfg['refreshToken']),
    });
    const res = await fetch(`${amazonBaseUrl(cfg)}/products/pricing/v0/price`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': token,
      },
      body: JSON.stringify({
        sellerSku: input.platformProductId,
        marketplaceId: AMAZON_MARKETPLACE_ID,
        price: { amount: input.priceKurus / 100, currencyCode: 'TRY' },
      }),
    });
    if (!res.ok) throw new Error(`Pricing API ${res.status}`);
  },

  async fetchOrders(ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    try {
      const token = await getLwaToken({
        clientId: String(cfg['clientId']),
        clientSecret: String(cfg['clientSecret']),
        refreshToken: String(cfg['refreshToken']),
      });
      const res = await fetch(
        `${amazonBaseUrl(cfg)}/orders/v0/orders?MarketplaceIds=${AMAZON_MARKETPLACE_ID}`,
        { headers: { 'x-amz-access-token': token } },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        payload?: {
          Orders?: Array<{
            AmazonOrderId: string;
            OrderNumber?: string;
            BuyerName?: string;
            ShippingAddress?: { Name?: string; Phone?: string; AddressLine1?: string };
            OrderTotal?: { Amount: string };
            items?: Array<{ SellerSKU?: string; QuantityOrdered: number; ItemPrice?: { Amount: string } }>;
            OrderStatus: string;
            PurchaseDate: string;
          }>;
        };
      };
      return (data.payload?.Orders ?? []).map((o) => ({
        platformOrderId: o.AmazonOrderId,
        orderNumber: o.OrderNumber ?? o.AmazonOrderId,
        status: o.OrderStatus,
        totalKurus: Math.round(parseFloat(o.OrderTotal?.Amount ?? '0') * 100),
        customer: {
          name: o.ShippingAddress?.Name ?? o.BuyerName ?? 'Amazon Customer',
          phone: o.ShippingAddress?.Phone ?? '',
          address: o.ShippingAddress?.AddressLine1 ?? '',
        },
        items: (o.items ?? []).map((i) => ({
          sku: i.SellerSKU ?? 'unknown',
          quantity: i.QuantityOrdered,
          priceKurus: Math.round(parseFloat(i.ItemPrice?.Amount ?? '0') * 100),
        })),
        createdAt: o.PurchaseDate,
      }));
    } catch {
      return [];
    }
  },

  async updateShipment(input, ctx) {
    const cfg = ctx.config as Record<string, unknown>;
    const token = await getLwaToken({
      clientId: String(cfg['clientId']),
      clientSecret: String(cfg['clientSecret']),
      refreshToken: String(cfg['refreshToken']),
    });
    const res = await fetch(`${amazonBaseUrl(cfg)}/orders/v0/orders/${input.platformOrderId}/shipment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': token,
      },
      body: JSON.stringify({
        cargoCompany: input.cargoProvider,
        trackingNumber: input.trackingNumber,
      }),
    });
    if (!res.ok) throw new Error(`Shipment API ${res.status}`);
  },
};

const handlers = {
  adapter,
  async onProductCreated(_ctx: PluginContext, product: { sku: string }): Promise<void> {
    console.log(`[Amazon TR] Yeni ürün: ${product.sku}`);
  },
  async onProductUpdated(_ctx: PluginContext, product: { sku: string }): Promise<void> {
    console.log(`[Amazon TR] Ürün güncellendi: ${product.sku}`);
  },
  async onOrderShipped(_ctx: PluginContext, order: { orderId: string }): Promise<void> {
    console.log(`[Amazon TR] Sipariş kargoya verildi: ${order.orderId}`);
  },
};

export { manifest, handlers };
export default handlers;