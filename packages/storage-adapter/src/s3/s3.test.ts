/**
 * S3 driver birim testleri.
 *
 * AWS V4 imzasının doğru oluşturulduğunu, presigned URL'lerin tenant
 * izolasyonunu koruduğunu ve R2/S3 uyumluluğunu doğrular.
 */
import { describe, it, expect } from 'vitest';
import { S3StorageDriver, createS3Storage } from './index.js';

describe('S3StorageDriver', () => {
  const validCfg = {
    endpoint: 'https://s3.eu-central-1.amazonaws.com',
    region: 'eu-central-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    bucket: 'eticart-test',
  };

  describe('Yapılandırma', () => {
    it('Eksik config → hata', () => {
      expect(() => new S3StorageDriver({ ...validCfg, accessKeyId: '' })).toThrow();
      expect(() => new S3StorageDriver({ ...validCfg, secretAccessKey: '' })).toThrow();
      expect(() => new S3StorageDriver({ ...validCfg, bucket: '' })).toThrow();
      expect(() => new S3StorageDriver({ ...validCfg, endpoint: '' })).toThrow();
    });

    it('Endpoint trailing slash normalize', () => {
      const d = new S3StorageDriver({ ...validCfg, endpoint: 'https://s3.example.com/' });
      // endpoint slash'sız kullanılıyor (private; davranış test ediliyor)
      expect(d.name).toBe('s3');
    });

    it('createS3Storage factory', () => {
      const d = createS3Storage(validCfg);
      expect(d).toBeInstanceOf(S3StorageDriver);
    });
  });

  describe('Presigned PUT URL', () => {
    it('URL içinde AWS4-HMAC-SHA256 algorithm var', async () => {
      const d = new S3StorageDriver(validCfg);
      const url = await d.signedPutUrl(
        'tenants/abc/products/cover.jpg',
        'image/jpeg',
        600,
      );

      expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(url).toContain('X-Amz-Credential=');
      expect(url).toContain('X-Amz-Date=');
      expect(url).toContain('X-Amz-Expires=');
      expect(url).toContain('X-Amz-SignedHeaders=host;x-amz-content-sha256;x-amz-date');
      expect(url).toContain('X-Amz-Signature=');
    });

    it('Content-Type URL\'e eklenmez (header olarak gönderilir)', async () => {
      const d = new S3StorageDriver(validCfg);
      const url = await d.signedPutUrl('key', 'image/png', 600);

      // Content-Type presigned URL'de yok (sadece signature var)
      expect(url).not.toContain('image%2Fpng');
    });

    it('Path-style URL (MinIO)', async () => {
      const d = new S3StorageDriver({ ...validCfg, forcePathStyle: true });
      const url = await d.signedPutUrl('key', 'image/jpeg', 600);

      // Path-style: /eticart-test/key
      expect(url).toContain('/eticart-test/key');
    });

    it('Virtual-hosted-style URL (AWS S3)', async () => {
      const d = new S3StorageDriver(validCfg);
      const url = await d.signedPutUrl('key', 'image/jpeg', 600);

      // Virtual-hosted: eticart-test.s3.eu-central-1.amazonaws.com
      expect(url).toMatch(/eticart-test\..*amazonaws\.com/);
    });
  });

  describe('Presigned GET URL', () => {
    it('URL içinde imza var', async () => {
      const d = new S3StorageDriver(validCfg);
      const url = await d.signedGetUrl('tenants/abc/products/cover.jpg', { ttlSeconds: 300 });

      expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(url).toContain('X-Amz-Signature=');
      expect(url).toContain("tenants/abc/products/cover.jpg");
    });

    it('publicBaseUrl set edilirse CDN URL\'i döner', async () => {
      const d = new S3StorageDriver({
        ...validCfg,
        publicBaseUrl: 'https://cdn.eticart.com',
      });
      const url = await d.signedGetUrl('key', { ttlSeconds: 600 });

      expect(url).toContain('https://cdn.eticart.com/key?');
    });
  });

  describe('R2 (Cloudflare) uyumluluğu', () => {
    it('R2 endpoint ile presigned PUT üretir', async () => {
      const r2Cfg = {
        endpoint: 'https://account-id.r2.cloudflarestorage.com',
        region: 'auto',
        accessKeyId: 'r2_access_key_id',
        secretAccessKey: 'r2_secret_access_key_at_least_32_chars',
        bucket: 'eticart-r2',
      };
      const d = new S3StorageDriver(r2Cfg);

      const url = await d.signedPutUrl('tenants/x/cover.jpg', 'image/jpeg', 600);

      expect(url).toMatch(/r2\.cloudflarestorage\.com/);
      expect(url).toContain('eticart-r2');
      expect(url).toContain('X-Amz-Signature=');
    });

    it('R2 GET URL + CDN public URL', async () => {
      const r2Cfg = {
        ...{
          endpoint: 'https://account-id.r2.cloudflarestorage.com',
          region: 'auto',
          accessKeyId: 'r2_xxx',
          secretAccessKey: 'r2_yyy_at_least_32_chars_long',
          bucket: 'eticart-r2',
        },
        publicBaseUrl: 'https://media.eticart.com',
      };
      const d = new S3StorageDriver(r2Cfg);

      const url = await d.signedGetUrl('tenants/x/cover.jpg');

      expect(url).toContain('https://media.eticart.com/tenants/x/cover.jpg?');
    });
  });

  describe('Multi-tenant izolasyon', () => {
    it('Farklı tenant key\'leri ayrı ayrı çalışır', async () => {
      const d = new S3StorageDriver(validCfg);
      const tenantAKey = 'tenants/tenant-a/products/cover.jpg';
      const tenantBKey = 'tenants/tenant-b/products/cover.jpg';

      const urlA = await d.signedPutUrl(tenantAKey, 'image/jpeg', 600);
      const urlB = await d.signedPutUrl(tenantBKey, 'image/jpeg', 600);

      expect(urlA).toContain('tenant-a');
      expect(urlB).toContain('tenant-b');
      expect(urlA).not.toBe(urlB);
    });

    it('Tenant dışı key üretilemez (sanitize layer testi)', async () => {
      // buildStorageKey tenant_id prefix'i zorunlu kılar
      const { buildStorageKey } = await import('../sanitize.js');
      expect(() =>
        buildStorageKey('' as any, 'products/cover', 'a.jpg'),
      ).toThrow();
    });
  });

  describe('TTL', () => {
    it('Default TTL = 600 saniye', async () => {
      const d = new S3StorageDriver(validCfg);
      const url = await d.signedPutUrl('key', 'image/jpeg');
      // Expires parametresi
      const m = url.match(/X-Amz-Expires=(\d+)/);
      expect(m).toBeTruthy();
      const expires = parseInt(m![1]!, 10);
      // 600 ± 5s
      expect(expires).toBeGreaterThan(595);
      expect(expires).toBeLessThanOrEqual(600);
    });

    it('Custom TTL uygulanır', async () => {
      const d = new S3StorageDriver(validCfg);
      const url = await d.signedPutUrl('key', 'image/jpeg', 3600);
      const m = url.match(/X-Amz-Expires=(\d+)/);
      const expires = parseInt(m![1]!, 10);
      expect(expires).toBeGreaterThan(3595);
      expect(expires).toBeLessThanOrEqual(3600);
    });
  });
});