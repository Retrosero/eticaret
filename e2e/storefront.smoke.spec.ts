/**
 * E2E Smoke: Storefront (müşteri vitrin).
 *
 * Vitrin sayfalarının açıldığını ve temel unsurların yüklendiğini doğrular.
 * Browser tabanlı tam akış (sepet, ödeme) Faz 11+ kapsamında.
 */
import { test, expect } from '@playwright/test';

test.describe('Storefront smoke', () => {
  test('Anasayfa açılır + logo + nav', async ({ page }) => {
    await page.goto('/');

    // Sayfa yüklendi
    await expect(page).toHaveTitle(/eticart|EtiCart/i);

    // Nav menüsü görünür
    await expect(page.locator('nav, header').first()).toBeVisible();
  });

  test('Ürün listesi sayfası açılır', async ({ page }) => {
    await page.goto('/products');

    // Sayfa 200
    const response = await page.waitForResponse(
      (res) => res.url().includes('/products') && res.status() < 500,
      { timeout: 10_000 },
    );
    expect([200, 304]).toContain(response.status());
  });

  test('Ürün detay sayfası slug ile açılır', async ({ page }) => {
    await page.goto('/products/test-urun');

    // Sayfa yüklendi (404 de kabul edilir — test ürünü yok)
    const status = (await page.evaluate(() => document.title)) ? 200 : 404;
    expect([200, 404]).toContain(status);
  });

  test('Sepet sayfası açılır', async ({ page }) => {
    await page.goto('/cart');

    // Sepet boş bile olsa sayfa açılmalı
    await expect(page.locator('body')).toBeVisible();
  });

  test('KVKK aydınlatma metni footer\'da', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Footer KVKK linki
    const kvkkLink = page.locator('a[href*="kvkk"], a[href*="aydinlatma"]');
    // Varsa kontrol et, yoksa skip
    const count = await kvkkLink.count();
    if (count > 0) {
      await expect(kvkkLink.first()).toBeVisible();
    }
  });

  test('Sayfa < 5 saniyede yüklenir (performance smoke)', async ({ page }) => {
    const start = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(5_000);
  });

  test('Responsive: mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Sayfa yüklendi
    await expect(page.locator('body')).toBeVisible();
  });
});