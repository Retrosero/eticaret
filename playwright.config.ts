/**
 * Playwright konfigürasyonu — E2E smoke testleri.
 *
 * Test ortamı:
 *   - Backend: http://localhost:9000 (NestJS, npm run start:dev)
 *   - Storefront: http://localhost:3000 (Next.js, npm run dev)
 *   - Admin: http://localhost:3001 (Next.js, npm run dev)
 *
 * Çalıştırmak için:
 *   1. Üç servis de ayağa kaldırılmalı
 *   2. npx playwright install (bir kerelik browser indirme)
 *   3. npm run test:e2e:playwright
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',

  use: {
    baseURL: process.env['STOREFRONT_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'storefront',
      testMatch: /.*\.storefront\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['STOREFRONT_URL'] ?? 'http://localhost:3000',
      },
    },
    {
      name: 'admin',
      testMatch: /.*\.admin\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['ADMIN_URL'] ?? 'http://localhost:3001',
      },
    },
  ],

  webServer: process.env['CI']
    ? undefined
    : [
        // Dev serverları otomatik başlatma — kullanıcı elle başlatmalı
      ],
});