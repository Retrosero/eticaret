/**
 * store-api.ts — Örnek mağaza veri erişim katmanı.
 *
 * Bu PoC için, Medusa'nın basitleştirilmiş bir muadili.
 * Tenant bağlamı zaten schema ile ayrıldığı için "cross-tenant" sorgular
 * imkansızdır. Buradaki her fonksiyon, verilen şema üzerinde çalışır.
 *
 * Tenant bağlamı doğrulaması fonksiyon parametresi olarak gelir; controller
 * katmanında `tenant-resolver` + `verifyTenantOwnership` ile kontrol edilir.
 */

import type pg from 'pg';
import { withAppClient } from './db.js';

export interface Product {
  id: string;
  tenant_id: string;
  sku: string;
  title: string;
  price_cents: number;
  created_at: Date;
}

export interface Order {
  id: string;
  tenant_id: string;
  customer_id: string;
  total_cents: number;
  status: string;
  created_at: Date;
}

/**
 * Tenant ürünlerini listeler.
 * Tenant bağlamı schema seviyesinde zorlandığı için sorguya ek filtre
 * gerekmez; ancak güvenlik için `tenant_id = $tenantId` filtresi de
 * uygulanır.
 */
export async function listProducts(schemaName: string, tenantId: string): Promise<Product[]> {
  return withAppClient(schemaName, async (client) => {
    const { rows } = await client.query<Product>(
      `SELECT id, tenant_id, sku, title, price_cents, created_at
       FROM products
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows;
  });
}

/**
 * Tenant ürünü detayını getirir. tenant_id uyuşmazsa null döner.
 */
export async function getProduct(
  schemaName: string,
  tenantId: string,
  productId: string,
): Promise<Product | null> {
  return withAppClient(schemaName, async (client) => {
    const { rows } = await client.query<Product>(
      `SELECT id, tenant_id, sku, title, price_cents, created_at
       FROM products
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [productId, tenantId],
    );
    return rows[0] ?? null;
  });
}

/**
 * Tenant sipariş detayı. tenant_id uyuşmazsa null döner.
 */
export async function getOrder(
  schemaName: string,
  tenantId: string,
  orderId: string,
): Promise<Order | null> {
  return withAppClient(schemaName, async (client) => {
    const { rows } = await client.query<Order>(
      `SELECT id, tenant_id, customer_id, total_cents, status, created_at
       FROM orders
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [orderId, tenantId],
    );
    return rows[0] ?? null;
  });
}

/**
 * Yeni ürün oluşturur. Idempotent: aynı SKU varsa mevcut kaydı döndürür.
 */
export async function createProduct(
  schemaName: string,
  tenantId: string,
  data: { sku: string; title: string; price_cents: number },
): Promise<Product> {
  return withAppClient(schemaName, async (client) => {
    // Önce mevcut kayda bak (idempotent)
    const existing = await client.query<Product>(
      `SELECT id, tenant_id, sku, title, price_cents, created_at
       FROM products
       WHERE tenant_id = $1 AND sku = $2
       LIMIT 1`,
      [tenantId, data.sku],
    );
    if (existing.rows[0]) return existing.rows[0];

    const { rows } = await client.query<Product>(
      `INSERT INTO products (tenant_id, sku, title, price_cents)
       VALUES ($1, $2, $3, $4)
       RETURNING id, tenant_id, sku, title, price_cents, created_at`,
      [tenantId, data.sku, data.title, data.price_cents],
    );
    return rows[0]!;
  });
}

/**
 * Customer oluşturur (sipariş oluşturma yardımcısı).
 */
export async function createCustomer(
  schemaName: string,
  tenantId: string,
  data: { email: string; name: string },
): Promise<{ id: string; email: string }> {
  return withAppClient(schemaName, async (client) => {
    const { rows } = await client.query<{ id: string; email: string }>(
      `INSERT INTO customers (tenant_id, email, name)
       VALUES ($1, $2, $3)
       RETURNING id, email`,
      [tenantId, data.email, data.name],
    );
    return rows[0]!;
  });
}

/**
 * Sipariş oluşturur.
 */
export async function createOrder(
  schemaName: string,
  tenantId: string,
  data: { customer_id: string; total_cents: number },
): Promise<Order> {
  return withAppClient(schemaName, async (client) => {
    const { rows } = await client.query<Order>(
      `INSERT INTO orders (tenant_id, customer_id, total_cents)
       VALUES ($1, $2, $3)
       RETURNING id, tenant_id, customer_id, total_cents, status, created_at`,
      [tenantId, data.customer_id, data.total_cents],
    );
    return rows[0]!;
  });
}

/**
 * Belirli bir tenant'ın tüm verilerini sayar (test/debug için).
 * Başka tenant'ın şemasına dokunmaz.
 */
export async function countTables(schemaName: string, table: 'products' | 'customers' | 'orders'): Promise<number> {
  return withAppClient(schemaName, async (client: pg.PoolClient) => {
    if (!/^(products|customers|orders)$/.test(table)) {
      throw new Error('Geçersiz tablo');
    }
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${table}`,
    );
    return parseInt(rows[0]!.count, 10);
  });
}
