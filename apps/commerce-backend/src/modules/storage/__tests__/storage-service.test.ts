/**
 * StorageService birim testleri.
 *
 * InMemoryStorageDriver kullanır — gerçek S3/R2 bağlantısı yok.
 * Multi-tenant izolasyon, key üretimi, presigned URL flow doğrulanır.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('StorageService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Her test öncesi env temizle
    delete process.env['S3_ENDPOINT'];
    delete process.env['S3_ACCESS_KEY_ID'];
    delete process.env['S3_SECRET_ACCESS_KEY'];
    delete process.env['S3_BUCKET'];
    delete process.env['LOCAL_STORAGE_DIR'];
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  describe('Driver seçimi', () => {
    it('Env yoksa InMemoryStorageDriver kullanılır (test default)', async () => {
      const { StorageService } = await import('../storage-service.js');
      const driver = StorageService.driver();

      expect(driver.name).toBe('memory');
      expect(StorageService.driverKind()).toBe('memory');
    });

    it('S3 env varsa S3StorageDriver kullanılır', async () => {
      process.env['S3_ENDPOINT'] = 'https://s3.eu-central-1.amazonaws.com';
      process.env['S3_ACCESS_KEY_ID'] = 'AKIAIOSFODNN7EXAMPLE';
      process.env['S3_SECRET_ACCESS_KEY'] = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      process.env['S3_BUCKET'] = 'eticart-test';
      process.env['S3_REGION'] = 'eu-central-1';

      const { StorageService } = await import('../storage-service.js');
      const driver = StorageService.driver();

      expect(driver.name).toBe('s3');
      expect(StorageService.driverKind()).toBe('s3');
    });

    it('R2 (Cloudflare) env varsa S3 driver seçilir (R2 S3-compatible)', async () => {
      process.env['S3_ENDPOINT'] = 'https://account-id.r2.cloudflarestorage.com';
      process.env['S3_ACCESS_KEY_ID'] = 'r2_key';
      process.env['S3_SECRET_ACCESS_KEY'] = 'r2_secret_at_least_32_chars_long';
      process.env['S3_BUCKET'] = 'eticart-r2';

      const { StorageService } = await import('../storage-service.js');
      const driver = StorageService.driver();

      expect(driver.name).toBe('s3');
    });

    it('LOCAL_STORAGE_DIR varsa LocalStorageDriver kullanılır', async () => {
      process.env['LOCAL_STORAGE_DIR'] = '/tmp/eticart-storage';
      process.env['LOCAL_STORAGE_PUBLIC_URL'] = 'http://localhost:9000/static';
      process.env['LOCAL_STORAGE_SIGNING_SECRET'] = 'dev-local-signing-secret-16chars';

      const { StorageService } = await import('../storage-service.js');
      const driver = StorageService.driver();

      expect(driver.name).toBe('local');
      expect(StorageService.driverKind()).toBe('local');
    });

    it('Singleton: ikinci çağrıda aynı driver', async () => {
      const { StorageService } = await import('../storage-service.js');
      const d1 = StorageService.driver();
      const d2 = StorageService.driver();
      expect(d1).toBe(d2);
    });
  });

  describe('buildKey', () => {
    it('Tenant prefix\'li key üretir', async () => {
      const { StorageService } = await import('../storage-service.js');
      const key = StorageService.buildKey(
        'tenant-uuid-1',
        'products/abc/cover',
        'image.jpg',
      );
      expect(key).toContain('tenants/tenant-uuid-1/products/abc/cover/image.jpg');
    });

    it('Path traversal karakterlerini temizler', async () => {
      const { StorageService } = await import('../storage-service.js');
      const key = StorageService.buildKey(
        'tenant-1',
        'products/../../../etc',
        'passwd',
      );
      // '../' segmentleri atlanır; kalan segmentler sanitize edilir
      expect(key).not.toContain('..');
      // 'etc' ve 'passwd' segmentleri sanitize sonrası 'etc' ve 'passwd' kalır ama safe forma dönüşür
      expect(key).toMatch(/tenants\/tenant-1\/products\/etc\/passwd/);
    });
  });

  describe('createUploadUrl', () => {
    it('Upload URL + key döner', async () => {
      const { StorageService } = await import('../storage-service.js');

      const result = await StorageService.createUploadUrl({
        tenantId: 'tenant-1',
        logicalPath: 'products/abc/cover',
        filename: 'cover.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.key).toContain('tenants/tenant-1/products/abc/cover/cover.jpg');
      expect(result.uploadUrl).toBeTruthy();
      expect(result.ttlSeconds).toBe(600);
    });

    it('Farklı tenant\'lar farklı key üretir', async () => {
      const { StorageService } = await import('../storage-service.js');

      const resA = await StorageService.createUploadUrl({
        tenantId: 'tenant-A',
        logicalPath: 'products/x',
        filename: 'a.jpg',
        contentType: 'image/jpeg',
      });
      const resB = await StorageService.createUploadUrl({
        tenantId: 'tenant-B',
        logicalPath: 'products/x',
        filename: 'a.jpg',
        contentType: 'image/jpeg',
      });

      expect(resA.key).toContain('tenant-A');
      expect(resB.key).toContain('tenant-B');
      expect(resA.key).not.toBe(resB.key);
    });
  });

  describe('createDownloadUrl', () => {
    it('Download URL + expiresAt döner', async () => {
      const { StorageService } = await import('../storage-service.js');

      const result = await StorageService.createDownloadUrl({
        key: 'tenants/tenant-1/products/x/cover.jpg',
        ttlSeconds: 300,
      });

      expect(result.url).toBeTruthy();
      expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('Multi-tenant izolasyon (remove)', () => {
    it('Tenant dışı key silinemez (cross-tenant koruması)', async () => {
      const { StorageService } = await import('../storage-service.js');

      const otherTenantKey = 'tenants/OTHER-TENANT/products/x/cover.jpg';

      await expect(
        StorageService.remove(otherTenantKey, 'tenant-1'),
      ).rejects.toThrow(/Cross-tenant/);
    });

    it('Kendi tenant key\'ini silebilir', async () => {
      const { StorageService, InMemoryStorageDriver } = await import('../storage-service.js');

      // Önce bir nesne yükle
      await StorageService.put({
        tenantId: 'tenant-1',
        logicalPath: 'products/x',
        filename: 'cover.jpg',
        body: Buffer.from('test'),
        contentType: 'image/jpeg',
      });

      const driver = StorageService.driver() as InstanceType<typeof InMemoryStorageDriver>;
      const myKey = 'tenants/tenant-1/products/x/cover.jpg';
      expect(driver.rawAll().has(myKey)).toBe(true);

      await StorageService.remove(myKey, 'tenant-1');
      expect(driver.rawAll().has(myKey)).toBe(false);
    });
  });
});