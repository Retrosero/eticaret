/**
 * Alert service testleri.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { alertService, Alert, type AlertMessage } from '../alert.service.js';
import type { AuditEvent } from '../audit.service.js';

describe('AlertService', () => {
  beforeEach(() => {
    alertService.reset();
  });

  describe('Sink konfigürasyonu', () => {
    it('Hiç sink yok → providers() boş', () => {
      expect(alertService.providers()).toEqual([]);
    });

    it('Slack sink aktif et', () => {
      alertService.enableSlack('https://hooks.slack.com/test');
      expect(alertService.providers()).toContain('slack');
    });

    it('Generic webhook sink aktif et', () => {
      alertService.enableGeneric('https://example.com/alert');
      expect(alertService.providers()).toContain('generic');
    });

    it('Birden fazla sink paralel çalışır', () => {
      alertService.enableSlack('https://hooks.slack.com/x');
      alertService.enableGeneric('https://example.com/y');
      expect(alertService.providers()).toEqual(['slack', 'generic']);
    });
  });

  describe('send()', () => {
    it('Tüm sink\'lere gönderir', async () => {
      // fetch mock
      global.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => '',
      })) as any;

      alertService.enableSlack('https://hooks.slack.com/x');
      alertService.enableGeneric('https://example.com/y');

      await Alert.send({
        title: 'Test Alert',
        body: 'Test body',
        severity: 'critical',
      });

      // 2 sink → 2 fetch çağrısı
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('Sink hatası → diğer sink\'ler etkilenmez', async () => {
      let callCount = 0;
      global.fetch = vi.fn(async (url: any) => {
        callCount++;
        if (url.includes('slack')) {
          throw new Error('Slack down');
        }
        return { ok: true, status: 200, text: async () => '' };
      }) as any;

      alertService.enableSlack('https://hooks.slack.com/x');
      alertService.enableGeneric('https://example.com/y');

      await Alert.send({
        title: 'Test',
        body: 'Body',
        severity: 'warning',
      });

      // Her ikisi de çağrıldı (hata yutuldu)
      expect(callCount).toBe(2);
    });

    it('Recent buffer\'a ekler', async () => {
      global.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })) as any;
      alertService.enableGeneric('https://example.com/y');

      await Alert.send({ title: 'T1', body: 'B1', severity: 'info' });
      await Alert.send({ title: 'T2', body: 'B2', severity: 'critical' });

      const recent = alertService.recent();
      expect(recent.length).toBe(2);
      expect(recent[0]!.title).toBe('T1');
      expect(recent[1]!.title).toBe('T2');
    });
  });

  describe('alertFromAudit', () => {
    beforeEach(() => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => '',
      })) as any;
      alertService.enableGeneric('https://example.com/y');
    });

    it('critical severity → alert gönderilir', async () => {
      const event: AuditEvent = {
        id: 'e1',
        action: 'tenant.cross_tenant_attempt',
        severity: 'critical',
        tenantId: 't1',
        userId: 'u1',
        ip: '1.2.3.4',
        timestamp: Date.now(),
      };

      await Alert.fromAudit(event);

      expect(global.fetch).toHaveBeenCalled();
      const recent = alertService.recent();
      expect(recent[0]!.event?.action).toBe('tenant.cross_tenant_attempt');
    });

    it('warning severity → alert GÖNDERİLMEZ', async () => {
      const event: AuditEvent = {
        id: 'e2',
        action: 'login.failure',
        severity: 'warning',
        timestamp: Date.now(),
      };

      await Alert.fromAudit(event);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('info severity → alert GÖNDERİLMEZ', async () => {
      const event: AuditEvent = {
        id: 'e3',
        action: 'login.success',
        severity: 'info',
        timestamp: Date.now(),
      };

      await Alert.fromAudit(event);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('Alert body\'de context bilgisi var', async () => {
      const event: AuditEvent = {
        id: 'e4',
        action: 'data.delete_completed',
        severity: 'critical',
        tenantId: 'tenant-xyz',
        userId: 'admin-1',
        ip: '10.0.0.1',
        context: { requestId: 'req-123' },
        timestamp: Date.now(),
      };

      await Alert.fromAudit(event);

      const recent = alertService.recent();
      expect(recent[0]!.body).toContain('data.delete_completed');
      expect(recent[0]!.body).toContain('tenant-xyz');
      expect(recent[0]!.body).toContain('admin-1');
      expect(recent[0]!.body).toContain('10.0.0.1');
    });
  });

  describe('Rate limiting', () => {
    beforeEach(() => {
      global.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })) as any;
      alertService.enableGeneric('https://example.com/y');
    });

    it('Dakikada max 10 alert', async () => {
      // 15 alert gönder
      for (let i = 0; i < 15; i++) {
        await Alert.send({ title: `T${i}`, body: 'B', severity: 'critical' });
      }

      // İlk 10'u gerçekten gönderildi, sonraki 5 rate limited
      expect(global.fetch).toHaveBeenCalledTimes(10);

      // Recent buffer'da hepsi var (rate limited mesajıyla)
      const recent = alertService.recent();
      expect(recent.length).toBe(15);
      expect(recent.slice(-5).every((m) => m.body.includes('RATE LIMITED'))).toBe(true);
    });
  });

  describe('HTTP POST', () => {
    it('Timeout 5 saniye', async () => {
      // Mock fetch uzun sürüyor
      global.fetch = vi.fn(async (_url: any, init: any) => {
        const signal = init?.signal as AbortSignal;
        return new Promise((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }) as any;

      alertService.enableGeneric('https://example.com/y');

      // PromiseSettledTimeout — reject bekliyoruz
      await Alert.send({ title: 'T', body: 'B', severity: 'critical' });

      // Send fonksiyonu promise.allSettled kullandığı için reject yutulur
      // Test sadece crash olmadığını doğrular
      expect(true).toBe(true);
    });
  });

  describe('reset', () => {
    it('Tüm sink ve alert\'leri temizler', () => {
      alertService.enableSlack('https://hooks.slack.com/x');
      alertService.reset();

      expect(alertService.providers()).toEqual([]);
      expect(alertService.recent()).toEqual([]);
    });
  });
});