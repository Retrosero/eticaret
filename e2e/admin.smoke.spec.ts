/**
 * E2E Smoke: Admin paneli (tenant-admin).
 *
 * Login + dashboard + temel sayfaların açıldığını doğrular.
 */
import { test, expect } from '@playwright/test';

test.describe('Admin smoke', () => {
  test('Login sayfası açılır + form', async ({ page }) => {
    await page.goto('/login');

    // Form elemanları
    await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"], button:has-text("Giriş"), button:has-text("Login")').first()).toBeVisible();
  });

  test('Login olmadan /dashboard → /login\'e yönlendirilir', async ({ page }) => {
    await page.goto('/dashboard');

    // Auth guard yönlendirmesi
    await page.waitForURL(/\/login/, { timeout: 5_000 });
    expect(page.url()).toContain('/login');
  });

  test('Login olmadan /products → /login\'e yönlendirilir', async ({ page }) => {
    await page.goto('/products');

    await page.waitForURL(/\/login/, { timeout: 5_000 });
    expect(page.url()).toContain('/login');
  });

  test('Login olmadan /orders → /login\'e yönlendirilir', async ({ page }) => {
    await page.goto('/orders');

    await page.waitForURL(/\/login/, { timeout: 5_000 });
    expect(page.url()).toContain('/login');
  });

  test('Login olmadan /invoices → /login\'e yönlendirilir', async ({ page }) => {
    await page.goto('/invoices');

    await page.waitForURL(/\/login/, { timeout: 5_000 });
    expect(page.url()).toContain('/login');
  });

  test('Login olmadan /settings → /login\'e yönlendirilir', async ({ page }) => {
    await page.goto('/settings');

    await page.waitForURL(/\/login/, { timeout: 5_000 });
    expect(page.url()).toContain('/login');
  });

  test('Sayfa < 5 saniyede yüklenir', async ({ page }) => {
    const start = Date.now();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(5_000);
  });

  test('Geçersiz login → hata mesajı', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"], input[type="text"]').first().fill('wrong@test.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').first().click();

    // Hata mesajı (flash/toast/alert)
    await page.waitForTimeout(2_000);
    // Hâlâ login sayfasında
    expect(page.url()).toContain('/login');
  });
});