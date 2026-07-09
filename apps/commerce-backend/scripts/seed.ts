/**
 * @eticart/commerce-backend — Demo seed script.
 *
 * Kullanım: `npx tsx scripts/seed.ts`
 * Veya:     `npm run seed` (DATABASE_URL gerekli)
 *
 * Amaç: Geliştirme ve demo için temel bir tenant + kullanıcı + ürün seti oluşturur.
 * Production'da çalıştırılmamalıdır — sadece staging/demo ortamları için.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tenantId = '00000000-0000-0000-0000-000000000001';

  // 1) Tenant
  console.log('[seed] Tenant oluşturuluyor...');
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: {
      id: tenantId,
      name: 'Demo Mağaza',
      slug: 'demo',
      status: 'active',
      defaultLocale: 'tr-TR',
      defaultCurrency: 'TRY',
    },
  });

  // 2) Brand
  console.log('[seed] Brand oluşturuluyor...');
  const brand = await prisma.brand.upsert({
    where: { tenantId_slug: { tenantId, slug: 'eticart' } },
    update: {},
    create: {
      tenantId,
      slug: 'eticart',
      name: 'EtiCart',
      description: 'Demo markası',
    },
  });

  // 3) TaxCategory (KDV)
  console.log('[seed] Vergi kategorisi oluşturuluyor...');
  await prisma.taxCategory.upsert({
    where: { tenantId_slug: { tenantId, slug: 'standart-kdv' } },
    update: {},
    create: {
      tenantId,
      slug: 'standart-kdv',
      name: 'Standart KDV (%20)',
      rate: 20.0,
    },
  });

  // 4) SalesChannel (Web mağaza)
  console.log('[seed] Satış kanalı oluşturuluyor...');
  await prisma.salesChannel.upsert({
    where: { tenantId_slug: { tenantId, slug: 'web' } },
    update: {},
    create: {
      tenantId,
      slug: 'web',
      name: 'Web Mağaza',
      kind: 'online',
      isDefault: true,
    },
  });

  // 5) Warehouse
  console.log('[seed] Depo oluşturuluyor...');
  await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId, code: 'MAIN' } },
    update: {},
    create: {
      tenantId,
      code: 'MAIN',
      name: 'Ana Depo',
      city: 'İstanbul',
      country: 'TR',
    },
  });

  // 6) Demo ürünler
  console.log('[seed] Demo ürünler oluşturuluyor...');
  const demoProducts = [
    { slug: 'demo-tshirt', title: 'Demo T-Shirt', sku: 'TSHIRT-DEMO-01', price: 199.9 },
    { slug: 'demo-mug', title: 'Demo Kupa', sku: 'MUG-DEMO-01', price: 89.9 },
    { slug: 'demo-cap', title: 'Demo Şapka', sku: 'CAP-DEMO-01', price: 149.9 },
  ];

  for (const p of demoProducts) {
    const product = await prisma.product.upsert({
      where: { tenantId_slug: { tenantId, slug: p.slug } },
      update: {},
      create: {
        tenantId,
        slug: p.slug,
        title: p.title,
        shortDescription: `${p.title} — demo ürün`,
        status: 'active',
        brandId: brand.id,
        publishedAt: new Date(),
      },
    });

    await prisma.productVariant.upsert({
      where: { tenantId_sku: { tenantId, sku: p.sku } },
      update: {},
      create: {
        tenantId,
        productId: product.id,
        sku: p.sku,
        name: p.title,
        priceAmount: p.price,
        currency: 'TRY',
        stockQty: 100,
      },
    });
  }

  // 7) Demo CustomerGroup + PriceList (B2B)
  console.log('[seed] B2B müşteri grubu + fiyat listesi oluşturuluyor...');
  const group = await prisma.customerGroup.upsert({
    where: { tenantId_slug: { tenantId, slug: 'gold-bayi' } },
    update: {},
    create: {
      tenantId,
      slug: 'gold-bayi',
      name: 'Gold Bayi',
      kind: 'b2b',
      forDealers: true,
    },
  });

  await prisma.priceList.upsert({
    where: { tenantId_slug: { tenantId, slug: 'gold-bayi-listesi' } },
    update: {},
    create: {
      tenantId,
      slug: 'gold-bayi-listesi',
      name: 'Gold Bayi Fiyat Listesi',
      kind: 'b2b_dealer',
      currency: 'TRY',
      priority: 100,
    },
  });

  // 8) Demo CompanyAccount (B2B bayi)
  console.log('[seed] Demo B2B bayi oluşturuluyor...');
  await prisma.companyAccount.upsert({
    where: { tenantId_taxId: { tenantId, taxId: '1234567890' } },
    update: {},
    create: {
      tenantId,
      taxId: '1234567890',
      legalName: 'Demo Bayi Ltd. Şti.',
      tradeName: 'Demo Bayi',
      status: 'active',
      customerGroupId: group.id,
    },
  });

  console.log('[seed] ✅ Demo veriler başarıyla oluşturuldu.');
  console.log(`[seed] Tenant ID: ${tenantId}`);
  console.log('[seed] Ürünler: demo-tshirt, demo-mug, demo-cap');
  console.log('[seed] B2B Bayi: Demo Bayi Ltd. Şti. (VKN: 1234567890)');
}

main()
  .catch((err) => {
    console.error('[seed] Hata:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });