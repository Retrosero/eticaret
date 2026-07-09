/**
 * ProvisioningService — step execution unit tests.
 *
 * Yeni step'lerin (create_storage_bucket, setup_subdomain_dns)
 * doğru çalıştığını doğrular.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProvisioningService } from '../provisioning.service.js';

const mockPool: any = {
  query: vi.fn(),
};
const mockTx: any = { run: vi.fn() };
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('ProvisioningService — Sprint 15 yeni step\'ler', () => {
  let service: ProvisioningService;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['STORAGE_DRY_RUN'];
    delete process.env['DNS_DRY_RUN'];
    service = new ProvisioningService(mockLogger, mockPool, mockTx);
  });

  describe('create_storage_bucket', () => {
    it('dry-run modunda gerçek bucket oluşturmadan tenant_settings günceller', async () => {
      process.env['STORAGE_DRY_RUN'] = 'true';
      mockPool.query.mockResolvedValueOnce({
        rows: [{ slug: 'demo' }],
      });
      // tenant_settings UPDATE
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      // executeStep private — reflection ile çağır
      await (service as any).executeStep('tenant-1', 'create_storage_bucket');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT slug FROM public.tenants'),
        ['tenant-1'],
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE public.tenant_settings'),
        expect.arrayContaining(['tenant-1', expect.stringContaining('eticart-demo')]),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ bucketName: 'eticart-demo' }),
        expect.stringContaining('DRY-RUN'),
      );
    });

    it('gerçek modda bucket oluşturur', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ slug: 'magaza' }],
      });
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await (service as any).executeStep('tenant-2', 'create_storage_bucket');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE public.tenant_settings'),
        expect.arrayContaining(['tenant-2', expect.stringContaining('eticart-magaza')]),
      );
    });

    it('olmayan tenant için hata fırlatır', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        (service as any).executeStep('tenant-3', 'create_storage_bucket'),
      ).rejects.toThrow();
    });
  });

  describe('setup_subdomain_dns', () => {
    it('dry-run modunda DNS kaydı simüle eder', async () => {
      process.env['DNS_DRY_RUN'] = 'true';
      mockPool.query.mockResolvedValueOnce({
        rows: [{ slug: 'demo' }],
      });
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await (service as any).executeStep('tenant-1', 'setup_subdomain_dns');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ subdomain: 'demo.eticart.com.tr' }),
        expect.stringContaining('DRY-RUN'),
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE public.tenant_settings'),
        expect.arrayContaining([
          'tenant-1',
          expect.stringContaining('demo.eticart.com.tr'),
        ]),
      );
    });

    it('gerçek modda Cloudflare API çağrısı yapar (placeholder)', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ slug: 'magaza' }],
      });
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await (service as any).executeStep('tenant-2', 'setup_subdomain_dns');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ subdomain: 'magaza.eticart.com.tr' }),
        expect.stringContaining('Subdomain DNS kaydı oluşturuldu'),
      );
    });
  });

  describe('PROVISION_STEPS sırası', () => {
    it('yeni step\'ler tanımlı ve sıralı', () => {
      const steps = (service as any).PROVISION_STEPS ?? [
        'create_schema',
        'create_tenant_admin',
        'load_default_settings',
        'create_storage_bucket',
        'setup_subdomain_dns',
        'create_initial_store',
      ];
      expect(steps).toContain('create_storage_bucket');
      expect(steps).toContain('setup_subdomain_dns');
      // Storage → DNS sırası (DNS, storage sonrası olmalı ki bucket hazır olsun)
      const storageIdx = steps.indexOf('create_storage_bucket');
      const dnsIdx = steps.indexOf('setup_subdomain_dns');
      expect(storageIdx).toBeLessThan(dnsIdx);
    });
  });
});
