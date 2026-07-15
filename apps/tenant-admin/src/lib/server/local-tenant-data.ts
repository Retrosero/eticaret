import { randomUUID } from 'node:crypto';
import type { Brand, Category, Customer, Invoice, Order, Product, ProductVariant } from '@/lib/api-types';
import { executeControlQuery, queryControlRows } from '@/lib/server/control-db';

const DEFAULT_CURRENCY = 'TRY';

interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  schema: string;
}

interface ProductRow extends Record<string, unknown> {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  long_description: string | null;
  status: string;
  brand_id: string | null;
  category_id: string | null;
  tax_category_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductVariantRow extends Record<string, unknown> {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  price_amount: string;
  compare_at_price: string | null;
  cost_amount: string | null;
  currency: string;
  stock_qty: number;
  weight: string | null;
  barcode: string | null;
  is_default: boolean;
}

interface CategoryRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  position: number;
}

interface BrandRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

interface CustomerRow extends Record<string, unknown> {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  status: string;
  total_orders: number;
  total_spent: string;
  created_at: string;
}

interface OrderRow extends Record<string, unknown> {
  id: string;
  customer_id: string | null;
  order_number: string;
  customer_email: string | null;
  customer_name: string | null;
  status: string;
  payment_status: string;
  currency: string;
  subtotal_amount: string;
  tax_total: string;
  shipping_total: string;
  discount_total: string;
  grand_total: string;
  payment_provider: string | null;
  payment_reference: string | null;
  item_count: number;
  placed_at: string | null;
  created_at: string;
}

interface InvoiceRow extends Record<string, unknown> {
  id: string;
  invoice_number: string;
  order_id: string;
  invoice_type: string;
  status: string;
  currency: string;
  total_amount: string;
  tax_total: string;
  issued_at: string | null;
  external_uuid: string | null;
  e_invoice_status: string | null;
  e_fatura_provider: string | null;
}

interface LocalTenantState {
  products: Product[];
  productVariants: Record<string, ProductVariant[]>;
  categories: Category[];
  brands: Brand[];
  customers: Customer[];
  orders: Order[];
  invoices: Invoice[];
}

const globalForLocalTenantData = globalThis as typeof globalThis & {
  __eticartTenantAdminEnsuredSchemas?: Set<string>;
};

function getEnsuredSchemas(): Set<string> {
  if (!globalForLocalTenantData.__eticartTenantAdminEnsuredSchemas) {
    globalForLocalTenantData.__eticartTenantAdminEnsuredSchemas = new Set<string>();
  }
  return globalForLocalTenantData.__eticartTenantAdminEnsuredSchemas;
}

function schemaNameFromSlug(slug: string): string {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Gecersiz tenant slug.');
  }

  const safe = slug.replace(/-/g, '_');
  if (!/^[a-z0-9_]+$/.test(safe)) {
    throw new Error('Gecersiz tenant slug.');
  }

  return `tenant_${safe}`;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Gecersiz SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function amountToString(value: string | number | null | undefined): string {
  if (value == null) return '0';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, '') : '0';
  }
  return value;
}

function amountToNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? 0));
  return Number.isFinite(numeric) ? numeric : 0;
}

async function resolveTenantContext(tenantId: string): Promise<TenantContext> {
  const rows = await queryControlRows<{ slug: string }>(
    `SELECT slug FROM public.tenants WHERE id = $1 LIMIT 1`,
    [tenantId],
  );

  const row = rows[0];
  if (!row?.slug) {
    throw new Error('Tenant bulunamadi.');
  }

  return {
    tenantId,
    tenantSlug: row.slug,
    schema: schemaNameFromSlug(row.slug),
  };
}

async function ensureTenantSchema(context: TenantContext): Promise<void> {
  const ensuredSchemas = getEnsuredSchemas();
  if (ensuredSchemas.has(context.schema)) {
    return;
  }

  const schema = quoteIdentifier(context.schema);
  const statements = [
    `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
    `CREATE SCHEMA IF NOT EXISTS ${schema}`,
    `
      CREATE TABLE IF NOT EXISTS ${schema}.brands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ${schema}.categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        parent_id UUID,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ${schema}.products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        short_description TEXT,
        long_description TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        brand_id UUID,
        category_id UUID,
        tax_category_id UUID,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ${schema}.product_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        price_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
        compare_at_price NUMERIC(15, 2),
        cost_amount NUMERIC(15, 2),
        currency TEXT NOT NULL DEFAULT 'TRY',
        stock_qty INTEGER NOT NULL DEFAULT 0,
        weight TEXT,
        barcode TEXT,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ${schema}.customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        full_name TEXT,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        total_orders INTEGER NOT NULL DEFAULT 0,
        total_spent NUMERIC(15, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ${schema}.orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID,
        order_number TEXT NOT NULL UNIQUE,
        customer_email TEXT,
        customer_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_status TEXT NOT NULL DEFAULT 'pending',
        currency TEXT NOT NULL DEFAULT 'TRY',
        subtotal_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
        tax_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
        shipping_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
        discount_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
        grand_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
        payment_provider TEXT,
        payment_reference TEXT,
        item_count INTEGER NOT NULL DEFAULT 0,
        placed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ${schema}.order_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number TEXT NOT NULL UNIQUE,
        order_id UUID NOT NULL,
        invoice_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'issued',
        currency TEXT NOT NULL DEFAULT 'TRY',
        total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
        tax_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
        issued_at TIMESTAMPTZ,
        external_uuid TEXT,
        e_invoice_status TEXT,
        e_fatura_provider TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  ];

  for (const statement of statements) {
    await executeControlQuery(statement);
  }

  await seedTenantSchema(context);
  ensuredSchemas.add(context.schema);
}

async function seedTenantSchema(context: TenantContext): Promise<void> {
  const schema = quoteIdentifier(context.schema);
  const customerCount = await queryControlRows<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${schema}.customers`,
  );

  if (Number(customerCount[0]?.count ?? '0') > 0) {
    return;
  }

  const customerId = randomUUID();
  await executeControlQuery(
    `
      INSERT INTO ${schema}.customers
        (id, email, full_name, phone, status, total_orders, total_spent)
      VALUES ($1, $2, $3, $4, 'active', 1, 2499)
    `,
    [customerId, `musteri+${context.tenantSlug}@example.com`, 'Ilk Musteri', '+90 555 000 0000'],
  );

  await executeControlQuery(
    `
      INSERT INTO ${schema}.orders
        (
          customer_id,
          order_number,
          customer_email,
          customer_name,
          status,
          payment_status,
          currency,
          subtotal_amount,
          tax_total,
          shipping_total,
          discount_total,
          grand_total,
          payment_provider,
          item_count,
          placed_at
        )
      VALUES
        ($1, $2, $3, $4, 'delivered', 'captured', $5, 2499, 450, 0, 0, 2499, 'manual', 1, NOW())
    `,
    [
      customerId,
      `EC-${context.tenantSlug.slice(0, 4).toUpperCase()}-1001`,
      `musteri+${context.tenantSlug}@example.com`,
      'Ilk Musteri',
      DEFAULT_CURRENCY,
    ],
  );
}

async function withTenantContext<T>(
  tenantId: string,
  work: (context: TenantContext) => Promise<T>,
): Promise<T> {
  const context = await resolveTenantContext(tenantId);
  await ensureTenantSchema(context);
  return work(context);
}

function mapProduct(tenantId: string, row: ProductRow): Product {
  return {
    id: row.id,
    tenantId,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    status: (row.status as Product['status']) ?? 'draft',
    brandId: row.brand_id,
    categoryId: row.category_id,
    taxCategoryId: row.tax_category_id,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVariant(tenantId: string, row: ProductVariantRow): ProductVariant {
  return {
    id: row.id,
    tenantId,
    productId: row.product_id,
    sku: row.sku,
    name: row.name,
    priceAmount: amountToString(row.price_amount),
    compareAtPrice: row.compare_at_price,
    costAmount: row.cost_amount,
    currency: row.currency,
    stockQty: row.stock_qty,
    weight: row.weight,
    barcode: row.barcode,
    isDefault: row.is_default,
  };
}

function mapCategory(tenantId: string, row: CategoryRow): Category {
  return {
    id: row.id,
    tenantId,
    slug: row.slug,
    name: row.name,
    parentId: row.parent_id,
    position: row.position,
  };
}

function mapBrand(tenantId: string, row: BrandRow): Brand {
  return {
    id: row.id,
    tenantId,
    slug: row.slug,
    name: row.name,
    description: row.description,
  };
}

function mapCustomer(tenantId: string, row: CustomerRow): Customer {
  return {
    id: row.id,
    tenantId,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    status: (row.status as Customer['status']) ?? 'active',
    totalOrders: row.total_orders,
    totalSpent: amountToNumber(row.total_spent),
    createdAt: row.created_at,
  };
}

function mapOrder(tenantId: string, row: OrderRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    tenantId,
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    status: row.status as Order['status'],
    paymentStatus: row.payment_status as Order['paymentStatus'],
    currency: row.currency,
    subtotalAmount: amountToString(row.subtotal_amount),
    taxTotal: amountToString(row.tax_total),
    shippingTotal: amountToString(row.shipping_total),
    discountTotal: amountToString(row.discount_total),
    grandTotal: amountToString(row.grand_total),
    paymentProvider: row.payment_provider,
    paymentReference: row.payment_reference,
    itemCount: row.item_count,
    placedAt: row.placed_at,
    createdAt: row.created_at,
  };
}

function mapInvoice(tenantId: string, row: InvoiceRow): Invoice {
  return {
    id: row.id,
    tenantId,
    invoiceNumber: row.invoice_number,
    orderId: row.order_id,
    invoiceType: row.invoice_type as Invoice['invoiceType'],
    status: row.status as Invoice['status'],
    currency: row.currency,
    totalAmount: amountToString(row.total_amount),
    taxTotal: amountToString(row.tax_total),
    issuedAt: row.issued_at,
    externalUuid: row.external_uuid,
    eInvoiceStatus: (row.e_invoice_status as Invoice['eInvoiceStatus']) ?? undefined,
    eFaturaProvider: row.e_fatura_provider,
  };
}

export async function readTenantState(tenantId: string): Promise<LocalTenantState> {
  return withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    const [productsRes, variantsRes, categoriesRes, brandsRes, customersRes, ordersRes, invoicesRes] =
      await Promise.all([
        queryControlRows<ProductRow>(
          `SELECT id::text, slug, title, short_description, long_description, status, brand_id::text, category_id::text, tax_category_id::text, published_at::text, created_at::text, updated_at::text FROM ${schema}.products ORDER BY created_at DESC`,
        ),
        queryControlRows<ProductVariantRow>(
          `SELECT id::text, product_id::text, sku, name, price_amount::text, compare_at_price::text, cost_amount::text, currency, stock_qty, weight, barcode, is_default FROM ${schema}.product_variants ORDER BY created_at ASC`,
        ),
        queryControlRows<CategoryRow>(
          `SELECT id::text, slug, name, parent_id::text, position FROM ${schema}.categories ORDER BY position ASC, name ASC`,
        ),
        queryControlRows<BrandRow>(
          `SELECT id::text, slug, name, description FROM ${schema}.brands ORDER BY name ASC`,
        ),
        queryControlRows<CustomerRow>(
          `SELECT id::text, email, full_name, phone, status, total_orders, total_spent::text, created_at::text FROM ${schema}.customers ORDER BY created_at DESC`,
        ),
        queryControlRows<OrderRow>(
          `SELECT id::text, customer_id::text, order_number, customer_email, customer_name, status, payment_status, currency, subtotal_amount::text, tax_total::text, shipping_total::text, discount_total::text, grand_total::text, payment_provider, payment_reference, item_count, placed_at::text, created_at::text FROM ${schema}.orders ORDER BY created_at DESC`,
        ),
        queryControlRows<InvoiceRow>(
          `SELECT id::text, invoice_number, order_id::text, invoice_type, status, currency, total_amount::text, tax_total::text, issued_at::text, external_uuid, e_invoice_status, e_fatura_provider FROM ${schema}.order_invoices ORDER BY created_at DESC`,
        ),
      ]);

    const productVariants: Record<string, ProductVariant[]> = {};
    for (const variantRow of variantsRes) {
      const variant = mapVariant(tenantId, variantRow);
      productVariants[variant.productId] ??= [];
      productVariants[variant.productId]!.push(variant);
    }

    return {
      products: productsRes.map((row) => mapProduct(tenantId, row)),
      productVariants,
      categories: categoriesRes.map((row) => mapCategory(tenantId, row)),
      brands: brandsRes.map((row) => mapBrand(tenantId, row)),
      customers: customersRes.map((row) => mapCustomer(tenantId, row)),
      orders: ordersRes.map((row) => mapOrder(tenantId, row)),
      invoices: invoicesRes.map((row) => mapInvoice(tenantId, row)),
    };
  });
}

async function replaceProductVariants(
  schema: string,
  productId: string,
  variants: Array<Partial<ProductVariant>>,
): Promise<void> {
  await executeControlQuery(`DELETE FROM ${schema}.product_variants WHERE product_id = $1`, [productId]);

  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index] ?? {};
    await executeControlQuery(
      `
        INSERT INTO ${schema}.product_variants
          (id, product_id, sku, name, price_amount, compare_at_price, cost_amount, currency, stock_qty, weight, barcode, is_default)
        VALUES
          (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, NULL, NULL, $6, $7, NULL, $8, $9)
      `,
      [
        variant.id ?? null,
        productId,
        variant.sku ?? `SKU-${index + 1}`,
        variant.name ?? `Varyant ${index + 1}`,
        amountToNumber(variant.priceAmount),
        variant.currency ?? DEFAULT_CURRENCY,
        Number(variant.stockQty ?? 0),
        variant.barcode ?? null,
        Boolean(variant.isDefault ?? index === 0),
      ],
    );
  }
}

export async function createProduct(
  tenantId: string,
  payload: Omit<Product, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> & {
    variants?: Array<Partial<ProductVariant>>;
  },
): Promise<Product> {
  return withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    const productId = randomUUID();
    await executeControlQuery(
      `
        INSERT INTO ${schema}.products
          (id, slug, title, short_description, long_description, status, brand_id, category_id, tax_category_id, published_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9)
      `,
      [
        productId,
        payload.slug,
        payload.title,
        payload.shortDescription,
        payload.longDescription,
        payload.status,
        payload.brandId,
        payload.categoryId,
        payload.status === 'active' ? new Date().toISOString() : null,
      ],
    );

    const rows = await queryControlRows<ProductRow>(
      `SELECT id::text, slug, title, short_description, long_description, status, brand_id::text, category_id::text, tax_category_id::text, published_at::text, created_at::text, updated_at::text FROM ${schema}.products WHERE id = $1 LIMIT 1`,
      [productId],
    );
    const product = rows[0];
    if (!product) {
      throw new Error('Urun olusturulamadi.');
    }

    await replaceProductVariants(schema, product.id, payload.variants ?? []);
    return mapProduct(tenantId, product);
  });
}

export async function updateProduct(
  tenantId: string,
  productId: string,
  payload: Partial<Product> & { variants?: Array<Partial<ProductVariant>> },
): Promise<Product | null> {
  return withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    const existing = await queryControlRows<ProductRow>(
      `SELECT id::text, slug, title, short_description, long_description, status, brand_id::text, category_id::text, tax_category_id::text, published_at::text, created_at::text, updated_at::text FROM ${schema}.products WHERE id = $1 LIMIT 1`,
      [productId],
    );
    const current = existing[0];
    if (!current) {
      return null;
    }

    const nextStatus = (payload.status as Product['status'] | undefined) ?? (current.status as Product['status']);
    await executeControlQuery(
      `
        UPDATE ${schema}.products
        SET
          slug = $2,
          title = $3,
          short_description = $4,
          long_description = $5,
          status = $6,
          brand_id = $7,
          category_id = $8,
          published_at = $9,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        productId,
        payload.slug ?? current.slug,
        payload.title ?? current.title,
        payload.shortDescription !== undefined ? payload.shortDescription : current.short_description,
        payload.longDescription !== undefined ? payload.longDescription : current.long_description,
        nextStatus,
        payload.brandId !== undefined ? payload.brandId : current.brand_id,
        payload.categoryId !== undefined ? payload.categoryId : current.category_id,
        nextStatus === 'active' ? current.published_at ?? new Date().toISOString() : current.published_at,
      ],
    );

    if (payload.variants) {
      await replaceProductVariants(schema, productId, payload.variants);
    }

    const updated = await queryControlRows<ProductRow>(
      `SELECT id::text, slug, title, short_description, long_description, status, brand_id::text, category_id::text, tax_category_id::text, published_at::text, created_at::text, updated_at::text FROM ${schema}.products WHERE id = $1 LIMIT 1`,
      [productId],
    );
    return updated[0] ? mapProduct(tenantId, updated[0]) : null;
  });
}

export async function deleteProduct(tenantId: string, productId: string): Promise<void> {
  await withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    await executeControlQuery(`DELETE FROM ${schema}.product_variants WHERE product_id = $1`, [productId]);
    await executeControlQuery(`DELETE FROM ${schema}.products WHERE id = $1`, [productId]);
  });
}

export async function createCategory(
  tenantId: string,
  payload: Pick<Category, 'slug' | 'name' | 'parentId' | 'position'>,
): Promise<Category> {
  return withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    const categoryId = randomUUID();
    await executeControlQuery(
      `
        INSERT INTO ${schema}.categories
          (id, slug, name, parent_id, position)
        VALUES
          ($1, $2, $3, $4, $5)
      `,
      [categoryId, payload.slug, payload.name, payload.parentId, payload.position],
    );
    const rows = await queryControlRows<CategoryRow>(
      `SELECT id::text, slug, name, parent_id::text, position FROM ${schema}.categories WHERE id = $1 LIMIT 1`,
      [categoryId],
    );
    return mapCategory(tenantId, rows[0]!);
  });
}

export async function updateCategory(
  tenantId: string,
  categoryId: string,
  payload: Partial<Pick<Category, 'slug' | 'name' | 'parentId' | 'position'>>,
): Promise<Category | null> {
  return withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    const existing = await queryControlRows<CategoryRow>(
      `SELECT id::text, slug, name, parent_id::text, position FROM ${schema}.categories WHERE id = $1 LIMIT 1`,
      [categoryId],
    );
    const current = existing[0];
    if (!current) return null;

    await executeControlQuery(
      `
        UPDATE ${schema}.categories
        SET slug = $2, name = $3, parent_id = $4, position = $5, updated_at = NOW()
        WHERE id = $1
      `,
      [
        categoryId,
        payload.slug ?? current.slug,
        payload.name ?? current.name,
        payload.parentId !== undefined ? payload.parentId : current.parent_id,
        payload.position ?? current.position,
      ],
    );
    const updated = await queryControlRows<CategoryRow>(
      `SELECT id::text, slug, name, parent_id::text, position FROM ${schema}.categories WHERE id = $1 LIMIT 1`,
      [categoryId],
    );
    return updated[0] ? mapCategory(tenantId, updated[0]) : null;
  });
}

export async function deleteCategory(tenantId: string, categoryId: string): Promise<void> {
  await withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    await executeControlQuery(
      `UPDATE ${schema}.products SET category_id = NULL, updated_at = NOW() WHERE category_id = $1`,
      [categoryId],
    );
    await executeControlQuery(`DELETE FROM ${schema}.categories WHERE id = $1`, [categoryId]);
  });
}

export async function createBrand(
  tenantId: string,
  payload: Pick<Brand, 'slug' | 'name' | 'description'>,
): Promise<Brand> {
  return withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    const brandId = randomUUID();
    await executeControlQuery(
      `
        INSERT INTO ${schema}.brands
          (id, slug, name, description)
        VALUES
          ($1, $2, $3, $4)
      `,
      [brandId, payload.slug, payload.name, payload.description],
    );
    const rows = await queryControlRows<BrandRow>(
      `SELECT id::text, slug, name, description FROM ${schema}.brands WHERE id = $1 LIMIT 1`,
      [brandId],
    );
    return mapBrand(tenantId, rows[0]!);
  });
}

export async function updateBrand(
  tenantId: string,
  brandId: string,
  payload: Partial<Pick<Brand, 'slug' | 'name' | 'description'>>,
): Promise<Brand | null> {
  return withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    const existing = await queryControlRows<BrandRow>(
      `SELECT id::text, slug, name, description FROM ${schema}.brands WHERE id = $1 LIMIT 1`,
      [brandId],
    );
    const current = existing[0];
    if (!current) return null;

    await executeControlQuery(
      `
        UPDATE ${schema}.brands
        SET slug = $2, name = $3, description = $4, updated_at = NOW()
        WHERE id = $1
      `,
      [brandId, payload.slug ?? current.slug, payload.name ?? current.name, payload.description ?? current.description],
    );
    const updated = await queryControlRows<BrandRow>(
      `SELECT id::text, slug, name, description FROM ${schema}.brands WHERE id = $1 LIMIT 1`,
      [brandId],
    );
    return updated[0] ? mapBrand(tenantId, updated[0]) : null;
  });
}

export async function deleteBrand(tenantId: string, brandId: string): Promise<void> {
  await withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    await executeControlQuery(
      `UPDATE ${schema}.products SET brand_id = NULL, updated_at = NOW() WHERE brand_id = $1`,
      [brandId],
    );
    await executeControlQuery(`DELETE FROM ${schema}.brands WHERE id = $1`, [brandId]);
  });
}

export async function updateOrderStatus(
  tenantId: string,
  orderId: string,
  status: string,
): Promise<Order | null> {
  return withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    await executeControlQuery(
      `
        UPDATE ${schema}.orders
        SET status = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [orderId, status],
    );
    const rows = await queryControlRows<OrderRow>(
      `SELECT id::text, customer_id::text, order_number, customer_email, customer_name, status, payment_status, currency, subtotal_amount::text, tax_total::text, shipping_total::text, discount_total::text, grand_total::text, payment_provider, payment_reference, item_count, placed_at::text, created_at::text FROM ${schema}.orders WHERE id = $1 LIMIT 1`,
      [orderId],
    );
    return rows[0] ? mapOrder(tenantId, rows[0]) : null;
  });
}

export async function createInvoice(
  tenantId: string,
  orderId: string,
  invoiceType: Invoice['invoiceType'],
): Promise<Invoice> {
  return withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    const orderRows = await queryControlRows<OrderRow>(
      `SELECT id::text, customer_id::text, order_number, customer_email, customer_name, status, payment_status, currency, subtotal_amount::text, tax_total::text, shipping_total::text, discount_total::text, grand_total::text, payment_provider, payment_reference, item_count, placed_at::text, created_at::text FROM ${schema}.orders WHERE id = $1 LIMIT 1`,
      [orderId],
    );
    const order = orderRows[0];
    if (!order) {
      throw new Error('Fatura icin siparis bulunamadi.');
    }

    const countRows = await queryControlRows<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${schema}.order_invoices`,
    );
    const invoiceNumber = `FTR-${String(Number(countRows[0]?.count ?? '0') + 1).padStart(5, '0')}`;
    const issuedAt = new Date().toISOString();

    const invoiceId = randomUUID();
    await executeControlQuery(
      `
        INSERT INTO ${schema}.order_invoices
          (id, invoice_number, order_id, invoice_type, status, currency, total_amount, tax_total, issued_at, external_uuid, e_invoice_status, e_fatura_provider)
        VALUES
          ($1, $2, $3, $4, 'issued', $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        invoiceId,
        invoiceNumber,
        orderId,
        invoiceType,
        order.currency,
        order.grand_total,
        order.tax_total,
        issuedAt,
        null,
        invoiceType === 'pdf' ? 'not_required' : 'pending',
        invoiceType === 'pdf' ? null : 'local',
      ],
    );
    const rows = await queryControlRows<InvoiceRow>(
      `SELECT id::text, invoice_number, order_id::text, invoice_type, status, currency, total_amount::text, tax_total::text, issued_at::text, external_uuid, e_invoice_status, e_fatura_provider FROM ${schema}.order_invoices WHERE id = $1 LIMIT 1`,
      [invoiceId],
    );
    return mapInvoice(tenantId, rows[0]!);
  });
}

export async function updateInvoice(
  tenantId: string,
  invoiceId: string,
  patch: Partial<Pick<Invoice, 'status' | 'externalUuid' | 'eInvoiceStatus' | 'eFaturaProvider'>>,
): Promise<Invoice | null> {
  return withTenantContext(tenantId, async (context) => {
    const schema = quoteIdentifier(context.schema);
    const currentRows = await queryControlRows<InvoiceRow>(
      `SELECT id::text, invoice_number, order_id::text, invoice_type, status, currency, total_amount::text, tax_total::text, issued_at::text, external_uuid, e_invoice_status, e_fatura_provider FROM ${schema}.order_invoices WHERE id = $1 LIMIT 1`,
      [invoiceId],
    );
    const current = currentRows[0];
    if (!current) return null;

    await executeControlQuery(
      `
        UPDATE ${schema}.order_invoices
        SET
          status = $2,
          external_uuid = $3,
          e_invoice_status = $4,
          e_fatura_provider = $5,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        invoiceId,
        patch.status ?? current.status,
        patch.externalUuid !== undefined ? patch.externalUuid : current.external_uuid,
        patch.eInvoiceStatus !== undefined ? patch.eInvoiceStatus : current.e_invoice_status,
        patch.eFaturaProvider !== undefined ? patch.eFaturaProvider : current.e_fatura_provider,
      ],
    );
    const rows = await queryControlRows<InvoiceRow>(
      `SELECT id::text, invoice_number, order_id::text, invoice_type, status, currency, total_amount::text, tax_total::text, issued_at::text, external_uuid, e_invoice_status, e_fatura_provider FROM ${schema}.order_invoices WHERE id = $1 LIMIT 1`,
      [invoiceId],
    );
    return rows[0] ? mapInvoice(tenantId, rows[0]) : null;
  });
}
