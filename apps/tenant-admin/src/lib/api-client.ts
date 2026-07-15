import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { Brand, Category, Customer, Invoice, Order, Product, ProductVariant } from './api-types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9000';
const LOCAL_AUTH_MODE = 'local-db';
const LOCAL_DATA_PREFIX = 'tenant-admin-local-data';
const DEFAULT_CURRENCY = 'TRY';

interface LocalTenantState {
  products: Product[];
  productVariants: Record<string, ProductVariant[]>;
  categories: Category[];
  brands: Brand[];
  customers: Customer[];
  orders: Order[];
  invoices: Invoice[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getCurrentTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('current_tenant_id');
}

function getCurrentAuthMode(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('auth_mode');
}

function isLocalTenantMode(): boolean {
  return typeof window !== 'undefined' && getCurrentAuthMode() === LOCAL_AUTH_MODE;
}

function getStorageKey(tenantId: string): string {
  return `${LOCAL_DATA_PREFIX}:${tenantId}`;
}

function createInitialState(tenantId: string): LocalTenantState {
  const createdAt = nowIso();
  const customerId = `customer-${tenantId.slice(0, 8)}-1`;
  const orderId = `order-${tenantId.slice(0, 8)}-1`;

  return {
    products: [],
    productVariants: {},
    categories: [],
    brands: [],
    customers: [
      {
        id: customerId,
        tenantId,
        email: `musteri+${tenantId.slice(0, 6)}@example.com`,
        fullName: 'Ilk Musteri',
        phone: '+90 555 000 0000',
        status: 'active',
        totalOrders: 1,
        totalSpent: 2499,
        createdAt,
      },
    ],
    orders: [
      {
        id: orderId,
        orderNumber: `EC-${tenantId.slice(0, 4).toUpperCase()}-1001`,
        tenantId,
        customerId,
        customerEmail: `musteri+${tenantId.slice(0, 6)}@example.com`,
        customerName: 'Ilk Musteri',
        status: 'delivered',
        paymentStatus: 'captured',
        currency: DEFAULT_CURRENCY,
        subtotalAmount: '2499',
        taxTotal: '450',
        shippingTotal: '0',
        discountTotal: '0',
        grandTotal: '2499',
        paymentProvider: 'manual',
        itemCount: 1,
        placedAt: createdAt,
        createdAt,
      },
    ],
    invoices: [],
  };
}

function readState(): LocalTenantState {
  const tenantId = getCurrentTenantId() ?? 'local-default';
  if (typeof window === 'undefined') {
    return createInitialState(tenantId);
  }

  const key = getStorageKey(tenantId);
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    const initial = createInitialState(tenantId);
    window.localStorage.setItem(key, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as LocalTenantState;
    return {
      ...createInitialState(tenantId),
      ...parsed,
      productVariants: parsed.productVariants ?? {},
    };
  } catch {
    const initial = createInitialState(tenantId);
    window.localStorage.setItem(key, JSON.stringify(initial));
    return initial;
  }
}

function writeState(state: LocalTenantState): void {
  if (typeof window === 'undefined') return;
  const tenantId = getCurrentTenantId() ?? 'local-default';
  window.localStorage.setItem(getStorageKey(tenantId), JSON.stringify(state));
}

function updateState(mutator: (state: LocalTenantState) => LocalTenantState): LocalTenantState {
  const nextState = mutator(readState());
  writeState(nextState);
  return nextState;
}

function parseBody(config: InternalAxiosRequestConfig): Record<string, unknown> {
  if (config.data == null) return {};
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof config.data === 'object') {
    return config.data as Record<string, unknown>;
  }
  return {};
}

function getPage(params: Record<string, unknown>): number {
  const page = Number(params.page ?? 1);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function getPageSize(params: Record<string, unknown>, fallback = 20): number {
  const pageSize = Number(params.pageSize ?? fallback);
  return Number.isFinite(pageSize) && pageSize > 0 ? pageSize : fallback;
}

function paginate<T>(items: T[], params: Record<string, unknown>, fallbackPageSize = 20) {
  const page = getPage(params);
  const pageSize = getPageSize(params, fallbackPageSize);
  const start = (page - 1) * pageSize;
  const sliced = items.slice(start, start + pageSize);

  return {
    items: sliced,
    total: items.length,
    page,
    pageSize,
  };
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeInvoiceNumber(invoices: Invoice[]): string {
  const next = invoices.length + 1;
  return `FTR-${String(next).padStart(5, '0')}`;
}

function makeAxiosError(
  message: string,
  status: number,
  config: InternalAxiosRequestConfig,
): never {
  throw new AxiosError(message, String(status), config, {}, {
    data: { message },
    status,
    statusText: message,
    headers: new AxiosHeaders(),
    config,
  });
}

function matchesSearch(value: string | null | undefined, q: string): boolean {
  return (value ?? '').toLowerCase().includes(q);
}

function filterProducts(items: Product[], params: Record<string, unknown>): Product[] {
  const q = String(params.q ?? '').trim().toLowerCase();
  const status = String(params.status ?? '').trim();

  return items.filter((item) => {
    if (status && item.status !== status) return false;
    if (!q) return true;
    return matchesSearch(item.title, q) || matchesSearch(item.slug, q) || matchesSearch(item.shortDescription, q);
  });
}

function filterOrders(items: Order[], params: Record<string, unknown>): Order[] {
  const q = String(params.q ?? '').trim().toLowerCase();
  const status = String(params.status ?? '').trim();

  return items.filter((item) => {
    if (status && item.status !== status) return false;
    if (!q) return true;
    return matchesSearch(item.orderNumber, q) || matchesSearch(item.customerEmail, q) || matchesSearch(item.customerName, q);
  });
}

function filterInvoices(items: Invoice[], params: Record<string, unknown>): Invoice[] {
  const q = String(params.q ?? '').trim().toLowerCase();
  const invoiceType = String(params.invoiceType ?? '').trim();
  const status = String(params.status ?? '').trim();

  return items.filter((item) => {
    if (invoiceType && item.invoiceType !== invoiceType) return false;
    if (status && item.status !== status) return false;
    if (!q) return true;
    return matchesSearch(item.invoiceNumber, q) || matchesSearch(item.orderId, q);
  });
}

function demoPayload(config: InternalAxiosRequestConfig): unknown {
  const rawUrl = config.url ?? '';
  const url = rawUrl.split('?')[0] ?? '';
  const verb = (config.method ?? 'get').toLowerCase();
  const params = (config.params ?? {}) as Record<string, unknown>;
  const body = parseBody(config);
  const tenantId = getCurrentTenantId() ?? 'local-default';

  if (url === '/auth/me') {
    return { ok: true };
  }

  if (url === '/products' && verb === 'get') {
    const state = readState();
    return paginate(filterProducts(state.products, params), params, 20);
  }

  if (url === '/products' && verb === 'post') {
    const createdAt = nowIso();
    const productId = makeId('product');

    const product: Product = {
      id: productId,
      tenantId,
      slug: String(body.slug ?? '').trim(),
      title: String(body.title ?? '').trim(),
      shortDescription: (body.shortDescription as string | null | undefined) ?? null,
      longDescription: (body.longDescription as string | null | undefined) ?? null,
      status: (body.status as Product['status'] | undefined) ?? 'draft',
      brandId: (body.brandId as string | null | undefined) ?? null,
      categoryId: (body.categoryId as string | null | undefined) ?? null,
      taxCategoryId: null,
      publishedAt: body.status === 'active' ? createdAt : null,
      createdAt,
      updatedAt: createdAt,
    };

    const variantInputs = Array.isArray(body.variants) ? body.variants : [];
    const variants: ProductVariant[] = variantInputs.map((variant, index) => {
      const item = variant as Record<string, unknown>;
      return {
        id: String(item.id ?? makeId('variant')),
        tenantId,
        productId,
        sku: String(item.sku ?? `SKU-${index + 1}`),
        name: String(item.name ?? `Varyant ${index + 1}`),
        priceAmount: String(item.priceAmount ?? '0'),
        compareAtPrice: null,
        costAmount: null,
        currency: DEFAULT_CURRENCY,
        stockQty: Number(item.stockQty ?? 0),
        weight: null,
        barcode: (item.barcode as string | null | undefined) ?? null,
        isDefault: Boolean(item.isDefault ?? index === 0),
      };
    });

    updateState((state) => ({
      ...state,
      products: [product, ...state.products],
      productVariants: { ...state.productVariants, [productId]: variants },
    }));

    return product;
  }

  if (url.match(/^\/products\/[^/]+\/variants$/) && verb === 'get') {
    const productId = url.split('/')[2] ?? '';
    const state = readState();
    return {
      items: clone(state.productVariants[productId] ?? []),
      total: (state.productVariants[productId] ?? []).length,
    };
  }

  if (url.match(/^\/products\/[^/]+$/) && (verb === 'get' || verb === 'put' || verb === 'patch' || verb === 'delete')) {
    const productId = url.split('/')[2] ?? '';

    if (verb === 'get') {
      const state = readState();
      const product = state.products.find((item) => item.id === productId);
      if (!product) {
        makeAxiosError('Urun bulunamadi.', 404, config);
      }
      return clone(product);
    }

    if (verb === 'delete') {
      updateState((state) => {
        const nextVariants = { ...state.productVariants };
        delete nextVariants[productId];
        return {
          ...state,
          products: state.products.filter((item) => item.id !== productId),
          productVariants: nextVariants,
        };
      });
      return { ok: true };
    }

    const nextState = updateState((state) => {
      const existing = state.products.find((item) => item.id === productId);
      if (!existing) {
        makeAxiosError('Urun bulunamadi.', 404, config);
      }

      const updatedAt = nowIso();
      const nextProduct: Product = {
        ...existing,
        slug: body.slug != null ? String(body.slug) : existing.slug,
        title: body.title != null ? String(body.title) : existing.title,
        shortDescription:
          body.shortDescription !== undefined ? (body.shortDescription as string | null) : existing.shortDescription,
        longDescription:
          body.longDescription !== undefined ? (body.longDescription as string | null) : existing.longDescription,
        status: (body.status as Product['status'] | undefined) ?? existing.status,
        brandId: body.brandId !== undefined ? (body.brandId as string | null) : existing.brandId,
        categoryId: body.categoryId !== undefined ? (body.categoryId as string | null) : existing.categoryId,
        publishedAt:
          ((body.status as Product['status'] | undefined) ?? existing.status) === 'active'
            ? existing.publishedAt ?? updatedAt
            : existing.publishedAt,
        updatedAt,
      };

      const nextVariants = { ...state.productVariants };
      if (Array.isArray(body.variants)) {
        nextVariants[productId] = body.variants.map((variant, index) => {
          const item = variant as Record<string, unknown>;
          return {
            id: String(item.id ?? makeId('variant')),
            tenantId,
            productId,
            sku: String(item.sku ?? `SKU-${index + 1}`),
            name: String(item.name ?? `Varyant ${index + 1}`),
            priceAmount: String(item.priceAmount ?? '0'),
            compareAtPrice: null,
            costAmount: null,
            currency: DEFAULT_CURRENCY,
            stockQty: Number(item.stockQty ?? 0),
            weight: null,
            barcode: (item.barcode as string | null | undefined) ?? null,
            isDefault: Boolean(item.isDefault ?? index === 0),
          } satisfies ProductVariant;
        });
      }

      return {
        ...state,
        products: state.products.map((item) => (item.id === productId ? nextProduct : item)),
        productVariants: nextVariants,
      };
    });

    return nextState.products.find((item) => item.id === productId);
  }

  if (url === '/categories' && verb === 'get') {
    const state = readState();
    return { items: clone(state.categories), total: state.categories.length };
  }

  if (url === '/categories' && verb === 'post') {
    const category: Category = {
      id: makeId('category'),
      tenantId,
      slug: String(body.slug ?? '').trim(),
      name: String(body.name ?? '').trim(),
      parentId: (body.parentId as string | null | undefined) ?? null,
      position: Number(body.position ?? 0),
    };

    updateState((state) => ({
      ...state,
      categories: [...state.categories, category].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    }));

    return category;
  }

  if (url.match(/^\/categories\/[^/]+$/) && (verb === 'get' || verb === 'put' || verb === 'delete')) {
    const categoryId = url.split('/')[2] ?? '';

    if (verb === 'get') {
      const state = readState();
      const category = state.categories.find((item) => item.id === categoryId);
      if (!category) {
        makeAxiosError('Kategori bulunamadi.', 404, config);
      }
      return clone(category);
    }

    if (verb === 'delete') {
      updateState((state) => ({
        ...state,
        categories: state.categories.filter((item) => item.id !== categoryId),
        products: state.products.map((item) =>
          item.categoryId === categoryId ? { ...item, categoryId: null, updatedAt: nowIso() } : item,
        ),
      }));
      return { ok: true };
    }

    const nextState = updateState((state) => ({
      ...state,
      categories: state.categories.map((item) =>
        item.id === categoryId
          ? {
              ...item,
              name: body.name != null ? String(body.name) : item.name,
              slug: body.slug != null ? String(body.slug) : item.slug,
              parentId: body.parentId !== undefined ? (body.parentId as string | null) : item.parentId,
              position: body.position !== undefined ? Number(body.position) : item.position,
            }
          : item,
      ),
    }));

    return nextState.categories.find((item) => item.id === categoryId);
  }

  if (url === '/brands' && verb === 'get') {
    const state = readState();
    return { items: clone(state.brands), total: state.brands.length };
  }

  if (url === '/brands' && verb === 'post') {
    const brand: Brand = {
      id: makeId('brand'),
      tenantId,
      slug: String(body.slug ?? '').trim(),
      name: String(body.name ?? '').trim(),
      description: (body.description as string | null | undefined) ?? null,
    };

    updateState((state) => ({
      ...state,
      brands: [...state.brands, brand].sort((a, b) => a.name.localeCompare(b.name)),
    }));

    return brand;
  }

  if (url.match(/^\/brands\/[^/]+$/) && (verb === 'get' || verb === 'put' || verb === 'delete')) {
    const brandId = url.split('/')[2] ?? '';

    if (verb === 'get') {
      const state = readState();
      const brand = state.brands.find((item) => item.id === brandId);
      if (!brand) {
        makeAxiosError('Marka bulunamadi.', 404, config);
      }
      return clone(brand);
    }

    if (verb === 'delete') {
      updateState((state) => ({
        ...state,
        brands: state.brands.filter((item) => item.id !== brandId),
        products: state.products.map((item) =>
          item.brandId === brandId ? { ...item, brandId: null, updatedAt: nowIso() } : item,
        ),
      }));
      return { ok: true };
    }

    const nextState = updateState((state) => ({
      ...state,
      brands: state.brands.map((item) =>
        item.id === brandId
          ? {
              ...item,
              name: body.name != null ? String(body.name) : item.name,
              slug: body.slug != null ? String(body.slug) : item.slug,
              description:
                body.description !== undefined ? (body.description as string | null) : item.description,
            }
          : item,
      ),
    }));

    return nextState.brands.find((item) => item.id === brandId);
  }

  if (url === '/customers') {
    const state = readState();
    return paginate(state.customers, params, 20);
  }

  if (url.match(/^\/customers\/[^/]+$/) && verb === 'get') {
    const customerId = url.split('/')[2] ?? '';
    const state = readState();
    const customer = state.customers.find((item) => item.id === customerId);
    if (!customer) {
      makeAxiosError('Musteri bulunamadi.', 404, config);
    }
    return clone(customer);
  }

  if (url === '/orders' && verb === 'get') {
    const state = readState();
    return paginate(filterOrders(state.orders, params), params, 50);
  }

  if (url.match(/^\/orders\/[^/]+$/) && verb === 'get') {
    const orderId = url.split('/')[2] ?? '';
    const state = readState();
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) {
      makeAxiosError('Siparis bulunamadi.', 404, config);
    }
    return { ...clone(order), items: [] };
  }

  if (url === '/invoices' && verb === 'get') {
    const state = readState();
    return paginate(filterInvoices(state.invoices, params), params, 20);
  }

  if (url === '/invoices' && verb === 'post') {
    const state = readState();
    const orderId = String(body.orderId ?? '');
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) {
      makeAxiosError('Fatura icin siparis bulunamadi.', 404, config);
    }

    const issuedAt = nowIso();
    const invoiceType = (body.type as Invoice['invoiceType'] | undefined) ?? 'pdf';
    const invoice: Invoice = {
      id: makeId('invoice'),
      tenantId,
      invoiceNumber: makeInvoiceNumber(state.invoices),
      orderId: order.id,
      invoiceType,
      status: 'issued',
      currency: order.currency,
      totalAmount: order.grandTotal,
      taxTotal: order.taxTotal,
      issuedAt,
      externalUuid: invoiceType === 'pdf' ? null : null,
      eInvoiceStatus: invoiceType === 'pdf' ? 'not_required' : 'pending',
      eFaturaProvider: invoiceType === 'pdf' ? null : 'local',
    };

    updateState((current) => ({
      ...current,
      invoices: [invoice, ...current.invoices],
    }));

    return invoice;
  }

  if (url.match(/^\/invoices\/[^/]+$/) && verb === 'get') {
    const invoiceId = url.split('/')[2] ?? '';
    const state = readState();
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    if (!invoice) {
      makeAxiosError('Fatura bulunamadi.', 404, config);
    }
    return clone(invoice);
  }

  if (url.match(/^\/invoices\/[^/]+\/resend$/) && verb === 'post') {
    const invoiceId = url.split('/')[2] ?? '';
    const nextState = updateState((state) => ({
      ...state,
      invoices: state.invoices.map((item) =>
        item.id === invoiceId
          ? {
              ...item,
              eInvoiceStatus: 'sent',
              externalUuid: item.externalUuid ?? makeId('gib'),
            }
          : item,
      ),
    }));
    const invoice = nextState.invoices.find((item) => item.id === invoiceId);
    if (!invoice) {
      makeAxiosError('Fatura bulunamadi.', 404, config);
    }
    return { status: invoice.eInvoiceStatus ?? 'not_required' };
  }

  if (url.match(/^\/invoices\/[^/]+\/refresh-status$/) && verb === 'post') {
    const invoiceId = url.split('/')[2] ?? '';
    const nextState = updateState((state) => ({
      ...state,
      invoices: state.invoices.map((item) =>
        item.id === invoiceId
          ? {
              ...item,
              eInvoiceStatus:
                item.invoiceType === 'pdf'
                  ? 'not_required'
                  : item.eInvoiceStatus === 'accepted'
                    ? 'accepted'
                    : 'accepted',
              externalUuid: item.externalUuid ?? makeId('gib'),
            }
          : item,
      ),
    }));
    const invoice = nextState.invoices.find((item) => item.id === invoiceId);
    if (!invoice) {
      makeAxiosError('Fatura bulunamadi.', 404, config);
    }
    return {
      status: invoice.eInvoiceStatus ?? 'not_required',
      gibReference: invoice.externalUuid ?? undefined,
    };
  }

  if (url.match(/^\/invoices\/[^/]+\/cancel$/) && verb === 'post') {
    const invoiceId = url.split('/')[2] ?? '';
    updateState((state) => ({
      ...state,
      invoices: state.invoices.map((item) =>
        item.id === invoiceId
          ? {
              ...item,
              status: 'cancelled',
              eInvoiceStatus: item.invoiceType === 'pdf' ? 'not_required' : 'cancelled',
            }
          : item,
      ),
    }));
    return { ok: true };
  }

  if (url === '/b2b/companies' || url === '/b2b/quotes' || url === '/b2b/approval/list') {
    return { items: [], total: 0 };
  }

  return { items: [], total: 0 };
}

void demoPayload;

const defaultAdapter = axios.getAdapter(axios.defaults.adapter);

function buildLocalRouteUrl(config: InternalAxiosRequestConfig): string {
  const rawUrl = config.url ?? '';
  const basePath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  const nextUrl = new URL(`/api/local-data${basePath}`, 'http://localhost');

  const params = (config.params ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        nextUrl.searchParams.append(key, String(item));
      }
      continue;
    }

    nextUrl.searchParams.set(key, String(value));
  }

  return `${nextUrl.pathname}${nextUrl.search}`;
}

async function proxyLocalRequest(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const headers = new Headers();
  const configHeaders = config.headers instanceof AxiosHeaders ? config.headers.toJSON() : config.headers;

  for (const [key, value] of Object.entries(configHeaders ?? {})) {
    if (value == null) continue;
    headers.set(key, String(value));
  }

  let body: string | undefined;
  if (config.data != null && !['get', 'delete'].includes((config.method ?? 'get').toLowerCase())) {
    body = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
  }

  const response = await fetch(buildLocalRouteUrl(config), {
    method: (config.method ?? 'get').toUpperCase(),
    headers,
    body,
    credentials: 'same-origin',
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new AxiosError(
      (payload as { message?: string } | null)?.message ?? response.statusText,
      String(response.status),
      config,
      {},
      {
        data: payload,
        status: response.status,
        statusText: response.statusText,
        headers: new AxiosHeaders(),
        config,
      },
    );
  }

  return {
    data: payload,
    status: response.status,
    statusText: response.statusText,
    headers: new AxiosHeaders(),
    config,
    request: {},
  };
}

const localTenantAdapter: AxiosAdapter = async (config): Promise<AxiosResponse> => {
  if (!isLocalTenantMode()) {
    return defaultAdapter(config);
  }

  return proxyLocalRequest(config);
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  adapter: localTenantAdapter,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('auth_token');
    const tenantId = window.localStorage.getItem('current_tenant_id');

    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    if (tenantId) {
      config.headers.set('X-Tenant-Id', tenantId);
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('auth_token');
      window.localStorage.removeItem('current_user');
      window.localStorage.removeItem('current_tenant_id');
      window.localStorage.removeItem('auth_mode');

      const path = window.location.pathname;
      if (!path.startsWith('/login')) {
        window.location.href = '/login?redirect=' + encodeURIComponent(path);
      }
    }
    return Promise.reject(error);
  },
);

export interface ApiError {
  statusCode: number;
  errorCode: string;
  message: string;
}

export function extractApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Beklenmeyen hata';
}
