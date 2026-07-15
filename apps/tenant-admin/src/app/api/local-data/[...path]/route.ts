import { NextResponse } from 'next/server';
import type { Invoice, Order, Product, ProductVariant } from '@/lib/api-types';
import { verifyTenantAccessToken } from '@/lib/server/local-auth';
import {
  createBrand,
  createCategory,
  createInvoice,
  createProduct,
  deleteBrand,
  deleteCategory,
  deleteProduct,
  readTenantState,
  updateBrand,
  updateCategory,
  updateInvoice,
  updateOrderStatus,
  updateProduct,
} from '@/lib/server/local-tenant-data';

export const runtime = 'nodejs';

function getBearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function resolveTenantId(request: Request): Promise<string | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const auth = await verifyTenantAccessToken(token);
  return auth?.tenantId ?? null;
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function matchesSearch(value: string | null | undefined, q: string): boolean {
  return (value ?? '').toLowerCase().includes(q);
}

function getPage(searchParams: URLSearchParams): number {
  const page = Number(searchParams.get('page') ?? 1);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function getPageSize(searchParams: URLSearchParams, fallback = 20): number {
  const pageSize = Number(searchParams.get('pageSize') ?? fallback);
  return Number.isFinite(pageSize) && pageSize > 0 ? pageSize : fallback;
}

function paginate<T>(items: T[], searchParams: URLSearchParams, fallbackPageSize = 20) {
  const page = getPage(searchParams);
  const pageSize = getPageSize(searchParams, fallbackPageSize);
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

function filterProducts(items: Product[], searchParams: URLSearchParams): Product[] {
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const status = (searchParams.get('status') ?? '').trim();

  return items.filter((item) => {
    if (status && item.status !== status) return false;
    if (!q) return true;
    return (
      matchesSearch(item.title, q) ||
      matchesSearch(item.slug, q) ||
      matchesSearch(item.shortDescription, q)
    );
  });
}

function filterCustomers(items: Array<any>, searchParams: URLSearchParams) {
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();

  return items.filter((item) => {
    if (!q) return true;
    return matchesSearch(item.email, q) || matchesSearch(item.fullName, q);
  });
}

function filterOrders(items: Order[], searchParams: URLSearchParams): Order[] {
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const status = (searchParams.get('status') ?? '').trim();

  return items.filter((item) => {
    if (status && item.status !== status) return false;
    if (!q) return true;
    return (
      matchesSearch(item.orderNumber, q) ||
      matchesSearch(item.customerEmail, q) ||
      matchesSearch(item.customerName, q)
    );
  });
}

function filterInvoices(items: Invoice[], searchParams: URLSearchParams): Invoice[] {
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const invoiceType = (searchParams.get('invoiceType') ?? '').trim();
  const status = (searchParams.get('status') ?? '').trim();

  return items.filter((item) => {
    if (invoiceType && item.invoiceType !== invoiceType) return false;
    if (status && item.status !== status) return false;
    if (!q) return true;
    return matchesSearch(item.invoiceNumber, q) || matchesSearch(item.orderId, q);
  });
}

function normalizeVariants(input: unknown): Array<Partial<ProductVariant>> {
  if (!Array.isArray(input)) return [];

  return input.map((variant) => {
    const item = (variant ?? {}) as Record<string, unknown>;
    return {
      id: typeof item.id === 'string' ? item.id : undefined,
      sku: String(item.sku ?? ''),
      name: String(item.name ?? ''),
      priceAmount: String(item.priceAmount ?? '0'),
      stockQty: Number(item.stockQty ?? 0),
      isDefault: Boolean(item.isDefault ?? false),
      barcode: (item.barcode as string | null | undefined) ?? null,
    };
  });
}

async function handleRequest(request: Request, path: string[]) {
  const tenantId = await resolveTenantId(request);
  if (!tenantId) {
    return jsonError('Yetkisiz.', 401);
  }

  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const body = method === 'GET' || method === 'DELETE' ? null : await request.json().catch(() => ({}));
  const [resource, id, action] = path;

  try {
    const state = await readTenantState(tenantId);

    if (resource === 'products' && method === 'GET' && !id) {
      return NextResponse.json(paginate(filterProducts(state.products, url.searchParams), url.searchParams, 20));
    }

    if (resource === 'products' && method === 'POST' && !id) {
      const created = await createProduct(tenantId, {
        slug: String(body?.slug ?? '').trim(),
        title: String(body?.title ?? '').trim(),
        shortDescription: (body?.shortDescription as string | null | undefined) ?? null,
        longDescription: (body?.longDescription as string | null | undefined) ?? null,
        status: ((body?.status as Product['status'] | undefined) ?? 'draft'),
        brandId: (body?.brandId as string | null | undefined) ?? null,
        categoryId: (body?.categoryId as string | null | undefined) ?? null,
        taxCategoryId: null,
        publishedAt: null,
        variants: normalizeVariants(body?.variants),
      });
      return NextResponse.json(created, { status: 201 });
    }

    if (resource === 'products' && id && action === 'variants' && method === 'GET') {
      const variants = state.productVariants[id] ?? [];
      return NextResponse.json({ items: variants, total: variants.length });
    }

    if (resource === 'products' && id && !action) {
      const product = state.products.find((item) => item.id === id);
      if (!product) return jsonError('Urun bulunamadi.', 404);

      if (method === 'GET') {
        return NextResponse.json(product);
      }

      if (method === 'DELETE') {
        await deleteProduct(tenantId, id);
        return NextResponse.json({ ok: true });
      }

      if (method === 'PUT' || method === 'PATCH') {
        const updated = await updateProduct(tenantId, id, {
          slug: body?.slug,
          title: body?.title,
          shortDescription: body?.shortDescription,
          longDescription: body?.longDescription,
          status: body?.status,
          brandId: body?.brandId,
          categoryId: body?.categoryId,
          variants: body?.variants ? normalizeVariants(body.variants) : undefined,
        });
        return NextResponse.json(updated);
      }
    }

    if (resource === 'categories' && method === 'GET' && !id) {
      return NextResponse.json({ items: state.categories, total: state.categories.length });
    }

    if (resource === 'categories' && method === 'POST' && !id) {
      const created = await createCategory(tenantId, {
        slug: String(body?.slug ?? '').trim(),
        name: String(body?.name ?? '').trim(),
        parentId: (body?.parentId as string | null | undefined) ?? null,
        position: Number(body?.position ?? 0),
      });
      return NextResponse.json(created, { status: 201 });
    }

    if (resource === 'categories' && id && !action) {
      const category = state.categories.find((item) => item.id === id);
      if (!category) return jsonError('Kategori bulunamadi.', 404);

      if (method === 'GET') {
        return NextResponse.json(category);
      }

      if (method === 'DELETE') {
        await deleteCategory(tenantId, id);
        return NextResponse.json({ ok: true });
      }

      if (method === 'PUT' || method === 'PATCH') {
        const updated = await updateCategory(tenantId, id, {
          slug: body?.slug,
          name: body?.name,
          parentId: body?.parentId,
          position: body?.position !== undefined ? Number(body.position) : undefined,
        });
        return NextResponse.json(updated);
      }
    }

    if (resource === 'brands' && method === 'GET' && !id) {
      return NextResponse.json({ items: state.brands, total: state.brands.length });
    }

    if (resource === 'brands' && method === 'POST' && !id) {
      const created = await createBrand(tenantId, {
        slug: String(body?.slug ?? '').trim(),
        name: String(body?.name ?? '').trim(),
        description: (body?.description as string | null | undefined) ?? null,
      });
      return NextResponse.json(created, { status: 201 });
    }

    if (resource === 'brands' && id && !action) {
      const brand = state.brands.find((item) => item.id === id);
      if (!brand) return jsonError('Marka bulunamadi.', 404);

      if (method === 'GET') {
        return NextResponse.json(brand);
      }

      if (method === 'DELETE') {
        await deleteBrand(tenantId, id);
        return NextResponse.json({ ok: true });
      }

      if (method === 'PUT' || method === 'PATCH') {
        const updated = await updateBrand(tenantId, id, {
          slug: body?.slug,
          name: body?.name,
          description: body?.description,
        });
        return NextResponse.json(updated);
      }
    }

    if (resource === 'customers' && method === 'GET' && !id) {
      return NextResponse.json(paginate(filterCustomers(state.customers, url.searchParams), url.searchParams, 20));
    }

    if (resource === 'customers' && id && method === 'GET') {
      const customer = state.customers.find((item) => item.id === id);
      if (!customer) return jsonError('Musteri bulunamadi.', 404);
      return NextResponse.json({ ...customer, addresses: [] });
    }

    if (resource === 'orders' && method === 'GET' && !id) {
      return NextResponse.json(paginate(filterOrders(state.orders, url.searchParams), url.searchParams, 50));
    }

    if (resource === 'orders' && id && !action && method === 'GET') {
      const order = state.orders.find((item) => item.id === id);
      if (!order) return jsonError('Siparis bulunamadi.', 404);
      return NextResponse.json({ ...order, items: [], history: [] });
    }

    if (resource === 'orders' && id && action && method === 'POST') {
      const nextStatus =
        action === 'transition'
          ? String(body?.toStatus ?? '')
          : action === 'cancel'
            ? 'cancelled'
            : action === 'return'
              ? 'returned'
              : '';

      if (!nextStatus) {
        return jsonError('Gecersiz siparis islemi.', 400);
      }

      const updated = await updateOrderStatus(tenantId, id, nextStatus);
      if (!updated) {
        return jsonError('Siparis bulunamadi.', 404);
      }
      return NextResponse.json(action === 'transition' ? { id, status: updated.status } : { ok: true });
    }

    if (resource === 'invoices' && method === 'GET' && !id) {
      return NextResponse.json(paginate(filterInvoices(state.invoices, url.searchParams), url.searchParams, 20));
    }

    if (resource === 'invoices' && method === 'POST' && !id) {
      const created = await createInvoice(
        tenantId,
        String(body?.orderId ?? ''),
        ((body?.type as Invoice['invoiceType'] | undefined) ?? 'pdf'),
      );
      return NextResponse.json(created, { status: 201 });
    }

    if (resource === 'invoices' && id && !action && method === 'GET') {
      const invoice = state.invoices.find((item) => item.id === id);
      if (!invoice) return jsonError('Fatura bulunamadi.', 404);
      return NextResponse.json(invoice);
    }

    if (resource === 'invoices' && id && action === 'resend' && method === 'POST') {
      const updated = await updateInvoice(tenantId, id, {
        externalUuid: `gib-${Date.now()}`,
        eInvoiceStatus: 'sent',
        eFaturaProvider: 'local',
      });
      if (!updated) return jsonError('Fatura bulunamadi.', 404);
      return NextResponse.json({ status: updated.eInvoiceStatus ?? 'not_required' });
    }

    if (resource === 'invoices' && id && action === 'refresh-status' && method === 'POST') {
      const current = state.invoices.find((item) => item.id === id);
      if (!current) return jsonError('Fatura bulunamadi.', 404);

      const updated = await updateInvoice(tenantId, id, {
        externalUuid: current.externalUuid ?? `gib-${Date.now()}`,
        eInvoiceStatus: current.invoiceType === 'pdf' ? 'not_required' : 'accepted',
      });

      if (!updated) return jsonError('Fatura bulunamadi.', 404);
      return NextResponse.json({
        status: updated.eInvoiceStatus ?? 'not_required',
        gibReference: updated.externalUuid ?? undefined,
      });
    }

    if (resource === 'invoices' && id && action === 'cancel' && method === 'POST') {
      const current = state.invoices.find((item) => item.id === id);
      if (!current) return jsonError('Fatura bulunamadi.', 404);

      await updateInvoice(tenantId, id, {
        status: 'cancelled',
        eInvoiceStatus: current.invoiceType === 'pdf' ? 'not_required' : 'cancelled',
      });
      return NextResponse.json({ ok: true });
    }

    if (resource === 'b2b') {
      return NextResponse.json({ items: [], total: 0 });
    }

    return NextResponse.json({ items: [], total: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata.';
    return jsonError(message, 500);
  }
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return handleRequest(request, path);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return handleRequest(request, path);
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return handleRequest(request, path);
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return handleRequest(request, path);
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return handleRequest(request, path);
}
