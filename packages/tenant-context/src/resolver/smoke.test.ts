import { describe, it, expect } from 'vitest';
import {
  InMemoryTenantResolver,
  normalizeHost,
  schemaNameFromSlug,
} from './index.js';

const sampleContext = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  tenantSlug: 'firma-a',
  schemaName: 'tenant_firma_a',
  primaryDomain: 'firma-a.local',
};

describe('@eticart/tenant-context', () => {
  describe('normalizeHost', () => {
    it('geçerli hostu küçük harfe çevirir', () => {
      expect(normalizeHost('FIRMA-A.LOCAL')).toBe('firma-a.local');
    });

    it('portu ayırır', () => {
      expect(normalizeHost('firma-a.local:3000')).toBe('firma-a.local');
    });

    it('geçersiz host için null döner', () => {
      expect(normalizeHost('-invalid-')).toBeNull();
      expect(normalizeHost('')).toBeNull();
      expect(normalizeHost('has space.local')).toBeNull();
      expect(normalizeHost('a'.repeat(254))).toBeNull();
    });
  });

  describe('schemaNameFromSlug', () => {
    it('slugdan güvenli şema adı üretir', () => {
      expect(schemaNameFromSlug('firma-a')).toBe('tenant_firma_a');
    });

    it('geçersiz slug için null döner', () => {
      expect(schemaNameFromSlug('FIRMA-A')).toBeNull();
      expect(schemaNameFromSlug('slug with space')).toBeNull();
    });
  });

  describe('InMemoryTenantResolver', () => {
    it('bilinen domaini çözümler', async () => {
      const resolver = new InMemoryTenantResolver([
        ['firma-a.local', sampleContext],
      ]);
      const ctx = await resolver.resolve('firma-a.local');
      expect(ctx?.tenantSlug).toBe('firma-a');
    });

    it('büyük-küçük harf duyarsız çözümler', async () => {
      const resolver = new InMemoryTenantResolver([
        ['firma-a.local', sampleContext],
      ]);
      const ctx = await resolver.resolve('FIRMA-A.LOCAL');
      expect(ctx?.tenantSlug).toBe('firma-a');
    });

    it('bilinmeyen domain için null döner', async () => {
      const resolver = new InMemoryTenantResolver([
        ['firma-a.local', sampleContext],
      ]);
      const ctx = await resolver.resolve('evil.example');
      expect(ctx).toBeNull();
    });
  });
});
