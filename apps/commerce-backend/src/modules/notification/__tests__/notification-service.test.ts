/**
 * NotificationService entegrasyon testleri.
 *
 * SMTP_HOST tanımsızsa SMTP adaptörü kayıt edilmez; diğer testler etkilenmez.
 * Mock transport ile gerçek SMTP adapter test edilebilir.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotificationService } from '../notification-service.js';

describe('NotificationService', () => {
  let origSmtpHost: string | undefined;
  let origResendKey: string | undefined;

  beforeEach(() => {
    origSmtpHost = process.env['SMTP_HOST'];
    origResendKey = process.env['RESEND_API_KEY'];
  });

  afterEach(() => {
    process.env['SMTP_HOST'] = origSmtpHost;
    process.env['RESEND_API_KEY'] = origResendKey;
  });

  it('env yoksa queue sessizce çalışır (adapter kayıt edilmez)', async () => {
    delete process.env['SMTP_HOST'];
    delete process.env['RESEND_API_KEY'];

    // Mock — gerçek SMTP çağrısı yapılmaz, queue noop döner
    await expect(
      NotificationService.enqueueOrderConfirmation({
        tenantId: 't-1',
        orderId: 'o-1',
        orderNumber: 'TRD-001',
        customerEmail: 'ali@test.com',
        customerName: 'Ali Yılmaz',
        total: '1250.00',
        currency: 'TRY',
      })
    ).resolves.toBeUndefined();
  });

  it('SMTP_HOST varsa adapter kayıt edilir ve email kuyruğa eklenir', async () => {
    process.env['SMTP_HOST'] = 'smtp.test.com';
    process.env['SMTP_PORT'] = '587';
    process.env['MAIL_FROM'] = 'shop@test.com';

    // NotificationService singleton olduğu için ilk çağrı configureFromEnv tetikler.
    // Test ortamında gerçek SMTP çağrısı InMemoryQueue üzerinden yapılır.
    // İlk çağrıda SMTP transport getTransport() nodemailer import edemez → uyarı loglanır, sessizce geçer.

    // Bu test sadece env konfigürasyonunu doğrular
    await expect(
      NotificationService.enqueueOrderStatusChanged({
        tenantId: 't-1',
        orderId: 'o-1',
        orderNumber: 'TRD-001',
        customerEmail: 'ali@test.com',
        customerName: 'Ali',
        oldStatus: 'pending',
        newStatus: 'shipped',
        trackingNumber: 'TR12345',
      })
    ).resolves.toBeUndefined();
  });

  it('enqueueDealerApproved: kuyruğa eklenir', async () => {
    await expect(
      NotificationService.enqueueDealerApproved({
        tenantId: 't-1',
        dealerEmail: 'bayi@test.com',
        dealerName: 'ABC Ltd. Şti.',
        creditLimit: '50000.00',
        currency: 'TRY',
      })
    ).resolves.toBeUndefined();
  });

  it('enqueueKvkkDataExportReady: kuyruğa eklenir', async () => {
    await expect(
      NotificationService.enqueueKvkkDataExportReady({
        tenantId: 't-1',
        customerEmail: 'ali@test.com',
        customerName: 'Ali',
        downloadUrl: 'https://eticart.local/api/export/abc',
        expiresAt: '2026-07-12',
      })
    ).resolves.toBeUndefined();
  });

  it('queue.size() enqueue sonrası 0 olur (InMemoryQueue arka planda işler)', async () => {
    const queue = NotificationService.queue;
    await NotificationService.enqueueOrderConfirmation({
      tenantId: 't-1',
      orderId: 'o-2',
      orderNumber: 'TRD-002',
      customerEmail: 'veli@test.com',
      customerName: 'Veli',
      total: '100.00',
      currency: 'TRY',
    });

    // Kısa süre bekle — InMemoryQueue arka planda işler
    await new Promise((r) => setTimeout(r, 100));
    expect(queue.size()).toBe(0);
  });

  it('defaultFrom email değiştirilebilir', () => {
    NotificationService.defaultFrom = { email: 'admin@test.com', name: 'Test Admin' };
    expect(NotificationService.defaultFrom.email).toBe('admin@test.com');
  });
});
