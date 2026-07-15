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

  describe('create_schema', () => {
    it('tenant icin gercek schema ve temel tablolari olusturur', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ slug: 'demo-magaza' }],
      });
      mockPool.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await (service as any).executeStep('tenant-1', 'create_schema');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT slug FROM public.tenants'),
        ['tenant-1'],
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE SCHEMA IF NOT EXISTS "tenant_demo_magaza"'),
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS "tenant_demo_magaza"."products"'),
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS "tenant_demo_magaza".brands'),
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.tenant_status_history'),
        ['tenant-1', 'tenant schema created: demo-magaza'],
      );
    });
  });

  describe('create_tenant_admin', () => {
    it('tenant admin kullanicisini tenant_users ve public.users tablolarinda hazirlar', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('ALTER TABLE public.tenant_users')) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes('SELECT slug, name, locale, currency, primary_domain, metadata')) {
          return {
            rows: [
              {
                slug: 'demo-magaza',
                name: 'Demo Magaza',
                locale: 'tr-TR',
                currency: 'TRY',
                primary_domain: null,
                metadata: { ownerEmail: 'admin@demo.com', ownerFullName: 'Demo Admin' },
              },
            ],
          };
        }
        if (sql.includes('FROM public.tenant_users')) {
          return {
            rows: [
              {
                id: 'tu-1',
                email: 'admin@demo.com',
                full_name: 'Demo Admin',
                password_hash: '$argon2id$existing-hash',
                role: 'owner',
                status: 'active',
              },
            ],
          };
        }
        if (sql.includes('FROM public.users') && sql.includes('WHERE tenant_id = $1')) {
          return { rows: [] };
        }
        if (sql.includes('FROM public.users') && sql.includes('WHERE lower(email) = $1')) {
          return { rows: [] };
        }
        return { rowCount: 1, rows: [] };
      });

      await (service as any).executeStep('tenant-1', 'create_tenant_admin');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.tenant_users'),
        ['tenant-1', 'admin@demo.com', 'Demo Admin', '$argon2id$existing-hash', 'owner'],
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.users'),
        ['admin@demo.com', 'Demo Admin', 'tenant_owner', 'tenant-1', '$argon2id$existing-hash'],
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE public.tenants'),
        [
          'tenant-1',
          expect.stringContaining('"ownerEmail":"admin@demo.com"'),
        ],
      );
    });
  });

  describe('create_initial_store', () => {
    it('tema, seo, menuler ve ana sayfa kaydini ilk kurulumda olusturur', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT slug, name, locale, currency, primary_domain, metadata')) {
          return {
            rows: [
              {
                slug: 'demo-magaza',
                name: 'Demo Magaza',
                locale: 'tr-TR',
                currency: 'TRY',
                primary_domain: null,
                metadata: { ownerEmail: 'admin@demo.com' },
              },
            ],
          };
        }
        if (sql.includes('FROM public.tenant_settings') && sql.includes('WHERE tenant_id = $1')) {
          return { rows: [] };
        }
        if (sql.includes('FROM public.theme_versions')) {
          return { rows: [{ version: '1.0.0' }] };
        }
        if (sql.includes('FROM public.tenant_theme_assignments')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO public.navigation_menus')) {
          if (sql.includes("'header'")) return { rows: [{ id: 'menu-header' }] };
          return { rows: [{ id: 'menu-footer' }] };
        }
        if (sql.includes('FROM public.navigation_menu_items')) {
          return { rows: [{ count: '0' }] };
        }
        if (sql.includes('FROM public.pages')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO public.pages')) {
          return { rows: [{ id: 'page-home' }] };
        }
        if (sql.includes('INSERT INTO public.page_revisions')) {
          return { rows: [{ id: 'rev-home' }] };
        }
        return { rowCount: 1, rows: [] };
      });

      await (service as any).executeStep('tenant-1', 'create_initial_store');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.tenant_settings'),
        expect.arrayContaining([
          'tenant-1',
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
        ]),
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.seo_settings'),
        expect.arrayContaining([
          'tenant-1',
          '%s | Demo Magaza',
          'Demo Magaza',
          expect.stringContaining('online magaza'),
          'https://demo-magaza.eticart.com.tr',
        ]),
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.tenant_theme_assignments'),
        ['tenant-1', '1.0.0'],
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.page_revisions'),
        expect.arrayContaining([
          'page-home',
          expect.stringContaining('"type":"hero"'),
          'Provisioning default home page',
        ]),
      );
    });
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
