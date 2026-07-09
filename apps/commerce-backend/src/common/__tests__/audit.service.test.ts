/**
 * Audit service testleri.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Audit, auditService, type AuditEvent } from '../audit.service.js';

describe('AuditService', () => {
  beforeEach(() => {
    auditService.clear();
  });

  describe('record', () => {
    it('Event ID ve timestamp üretir', () => {
      const event = Audit.record({
        action: 'login.success',
        severity: 'info',
        userId: 'u1',
        tenantId: 't1',
      });

      expect(event.id).toBeTruthy();
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.action).toBe('login.success');
    });

    it('In-memory buffer\'a ekler', () => {
      Audit.record({ action: 'login.success', severity: 'info', userId: 'u1' });
      Audit.record({ action: 'login.failure', severity: 'warning' });

      const recent = auditService.recent(10);
      expect(recent.length).toBe(2);
      expect(recent[0]!.action).toBe('login.success');
      expect(recent[1]!.action).toBe('login.failure');
    });

    it('Buffer max 500 olay tutar', () => {
      for (let i = 0; i < 600; i++) {
        Audit.record({ action: 'login.success', severity: 'info' });
      }
      expect(auditService.recent(1000).length).toBeLessThanOrEqual(500);
    });
  });

  describe('Helper methods', () => {
    it('loginSuccess', () => {
      Audit.loginSuccess({ userId: 'u1', tenantId: 't1', ip: '127.0.0.1' });
      const events = auditService.recent();
      expect(events[0]).toMatchObject({
        action: 'login.success',
        severity: 'info',
        userId: 'u1',
        tenantId: 't1',
        ip: '127.0.0.1',
      });
    });

    it('loginFailure: warning severity', () => {
      Audit.loginFailure({ email: 'test@test.com', reason: 'wrong_password', ip: '1.2.3.4' });
      const events = auditService.recent();
      expect(events[0]).toMatchObject({
        action: 'login.failure',
        severity: 'warning',
        context: { email: 'test@test.com', reason: 'wrong_password' },
      });
    });

    it('csrfViolation: warning', () => {
      Audit.csrfViolation({ reason: 'mismatch', ip: '1.2.3.4', path: '/api/admin/products' });
      const events = auditService.recent();
      expect(events[0]).toMatchObject({
        action: 'csrf.mismatch',
        severity: 'warning',
      });
    });

    it('rateLimitExceeded: warning', () => {
      Audit.rateLimitExceeded({ ip: '1.2.3.4', path: '/api/login', limit: 10 });
      const events = auditService.recent();
      expect(events[0]).toMatchObject({
        action: 'rate_limit.exceeded',
        severity: 'warning',
      });
    });

    it('crossTenantAttempt: critical severity', () => {
      Audit.crossTenantAttempt({
        userId: 'u1',
        userTenantId: 't1',
        targetTenantId: 't2',
        resource: '/api/admin/products',
        ip: '1.2.3.4',
      });
      const events = auditService.recent();
      expect(events[0]).toMatchObject({
        action: 'tenant.cross_tenant_attempt',
        severity: 'critical',
      });
    });

    it('dataDelete: critical', () => {
      Audit.dataDelete({
        customerId: 'c1',
        tenantId: 't1',
        requestId: 'r1',
      });
      const events = auditService.recent();
      expect(events[0]).toMatchObject({
        action: 'data.delete_completed',
        severity: 'critical',
      });
    });

    it('adminAction: info severity', () => {
      Audit.adminAction({
        action: 'admin.user_created',
        userId: 'u1',
        tenantId: 't1',
        target: 'u2',
      });
      const events = auditService.recent();
      expect(events[0]).toMatchObject({
        action: 'admin.user_created',
        severity: 'info',
      });
    });
  });

  describe('Filtreleme', () => {
    it('forTenant: tenant bazlı', () => {
      Audit.record({ action: 'login.success', severity: 'info', tenantId: 't1', userId: 'u1' });
      Audit.record({ action: 'login.success', severity: 'info', tenantId: 't2', userId: 'u2' });

      const t1Events = auditService.forTenant('t1');
      expect(t1Events.length).toBe(1);
      expect(t1Events[0]!.tenantId).toBe('t1');
    });

    it('forUser: user bazlı', () => {
      Audit.record({ action: 'login.success', severity: 'info', userId: 'u1' });
      Audit.record({ action: 'login.success', severity: 'info', userId: 'u2' });

      const u1Events = auditService.forUser('u1');
      expect(u1Events.length).toBe(1);
      expect(u1Events[0]!.userId).toBe('u1');
    });
  });

  describe('Logger unavailable (test ortamı)', () => {
    it('Logger hata verse bile event kaydedilir', () => {
      // Normal koşullarda log.error/warn/info başarılı; burada sadece
      // buffera eklenme garantisi test ediliyor
      const event = Audit.record({
        action: 'invoice.created',
        severity: 'critical',
        tenantId: 't1',
        userId: 'u1',
      });

      expect(event.id).toBeTruthy();
      const recent = auditService.recent();
      expect(recent).toContainEqual(event);
    });
  });

  describe('DB writer (dual-write)', () => {
    it('DB writer set edilmemişse in-memory bufferda kalır', () => {
      // default davranış: writer yok, sadece buffer
      auditService.setDbWriter(undefined as any);
      expect(auditService.isDbEnabled()).toBe(false);

      Audit.record({ action: 'login.success', severity: 'info' });
      // Hata fırlamamalı
    });

    it('DB writer set edilirse DB enabled olur', () => {
      const writer = vi.fn(async () => {});
      auditService.setDbWriter(writer);

      expect(auditService.isDbEnabled()).toBe(true);
    });

    it('Record → DB writer çağrılır (fire-and-forget)', async () => {
      const writer = vi.fn(async () => {});
      auditService.setDbWriter(writer);

      const event = Audit.record({
        action: 'login.success',
        severity: 'info',
        userId: 'u1',
        tenantId: 't1',
        ip: '1.2.3.4',
      });

      // Microtask'leri bekle
      await new Promise((r) => setTimeout(r, 10));

      expect(writer).toHaveBeenCalled();
      const call = writer.mock.calls[0][0];
      expect(call.id).toBe(event.id);
      expect(call.action).toBe('login.success');
      expect(call.severity).toBe('info');
      expect(call.userId).toBe('u1');
      expect(call.tenantId).toBe('t1');
      expect(call.ip).toBe('1.2.3.4');
    });

    it('DB writer hatası → event yine buffera eklenir', async () => {
      const writer = vi.fn(async () => {
        throw new Error('DB connection refused');
      });
      auditService.setDbWriter(writer);

      // Hata fırlamamalı
      expect(() => {
        Audit.record({ action: 'login.success', severity: 'info' });
      }).not.toThrow();

      // Buffer'a eklendi
      const recent = auditService.recent();
      expect(recent.length).toBeGreaterThan(0);
    });
  });
});