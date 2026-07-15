/**
 * Onboarding service — minimal unit tests.
 *
 * Bu testler DB bağımlılığı olmadan service logic'in doğru
 * çalıştığını doğrular (mock'lu dependency'ler).
 *
 * Faz 14 — Sprint "Self-serve SaaS Onboarding".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@eticart/config';

import { OnboardingService } from '../onboarding.service';

// Mock dependencies
const mockTenantsService: any = {
  create: vi.fn(),
  update: vi.fn(),
  triggerProvisioning: vi.fn(),
};
const mockPlans: any = {
  assertPlanExists: vi.fn(),
};
const mockSubscriptions: any = {
  create: vi.fn(),
};
const mockProvisioning: any = {
  enqueue: vi.fn().mockResolvedValue({ id: 'job-1' }),
  run: vi.fn().mockResolvedValue(undefined),
};
const mockEmailQueue: any = {
  enqueue: vi.fn(),
};
const mockRepo: any = {
  findBySlug: vi.fn(),
  setVerificationToken: vi.fn(),
  createTenantUser: vi.fn(),
  findByVerificationToken: vi.fn(),
  updateStatus: vi.fn(),
  markEmailVerified: vi.fn(),
  clearVerificationToken: vi.fn(),
  findTenantUserByEmail: vi.fn(),
};
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const sampleInput = {
  tenantName: 'Test Mağaza',
  slug: 'test-magaza',
  adminEmail: 'admin@test.com',
  adminFullName: 'Test Admin',
  adminPassword: 'Test1234!',
  planCode: 'starter',
  acceptTerms: true as const,
};

describe('OnboardingService', () => {
  let service: OnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OnboardingService(
      mockLogger,
      mockTenantsService,
      mockPlans,
      mockSubscriptions,
      mockEmailQueue,
      mockRepo,
      mockProvisioning,
    );
  });

  describe('signup()', () => {
    it('başarılı signup akışı', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      mockPlans.assertPlanExists.mockResolvedValue({
        id: 'plan-1',
        code: 'starter',
        trialDays: 14,
        currency: 'TRY',
        monthlyPriceKurus: 0,
        yearlyPriceKurus: 0,
      });
      mockProvisioning.enqueue.mockResolvedValue({ id: 'job-1', tenantId: 'tenant-1', status: 'queued', steps: [], attempts: 0, maxAttempts: 3, lastError: null, startedAt: null, finishedAt: null, nextRetryAt: null, idempotencyKey: null, triggeredBy: null, metadata: {}, createdAt: new Date(), updatedAt: new Date() });
    mockTenantsService.create.mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-magaza',
        status: 'draft',
      });
      mockRepo.createTenantUser.mockResolvedValue('user-1');
      mockSubscriptions.create.mockResolvedValue({ id: 'sub-1' });
      mockRepo.setVerificationToken.mockResolvedValue(undefined);
      mockEmailQueue.enqueue.mockResolvedValue(undefined);

      const result = await service.signup(sampleInput);

      expect(result).toMatchObject({
        tenantId: 'tenant-1',
        slug: 'test-magaza',
        subdomain: 'test-magaza.eticart.com.tr',
        status: 'draft',
      });
      expect(result.trialEndsAt).toBeDefined();
      expect(mockTenantsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerEmail: 'admin@test.com',
          metadata: expect.objectContaining({
            ownerFullName: 'Test Admin',
            signupSource: 'self_serve',
          }),
        }),
        null,
      );
      expect(mockRepo.createTenantUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@test.com',
          fullName: 'Test Admin',
          passwordHash: expect.stringContaining('$argon2id$'),
        }),
      );
    });

    it('mevcut slug için 409 fırlatır', async () => {
      mockRepo.findBySlug.mockResolvedValue({
        id: 'existing',
        slug: 'test-magaza',
        status: 'active',
        updatedAt: new Date(),
      });

      await expect(service.signup(sampleInput)).rejects.toThrow(ApiError);
      await expect(service.signup(sampleInput)).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('geçersiz plan kodu için 404 fırlatır', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      mockPlans.assertPlanExists.mockRejectedValue(
        new ApiError(404, 'NOT_FOUND' as any, 'Plan bulunamadı'),
      );

      await expect(service.signup(sampleInput)).rejects.toThrow(ApiError);
    });

    it('email queue hatası signupı engellemez (fire-and-forget)', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      mockPlans.assertPlanExists.mockResolvedValue({
        id: 'plan-1',
        code: 'starter',
        trialDays: 14,
        currency: 'TRY',
      });
      mockProvisioning.enqueue.mockResolvedValue({ id: 'job-1', tenantId: 'tenant-1', status: 'queued', steps: [], attempts: 0, maxAttempts: 3, lastError: null, startedAt: null, finishedAt: null, nextRetryAt: null, idempotencyKey: null, triggeredBy: null, metadata: {}, createdAt: new Date(), updatedAt: new Date() });
    mockTenantsService.create.mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-magaza',
        status: 'draft',
      });
      mockRepo.createTenantUser.mockResolvedValue('user-1');
      mockSubscriptions.create.mockResolvedValue({ id: 'sub-1' });
      mockRepo.setVerificationToken.mockResolvedValue(undefined);
      mockEmailQueue.enqueue.mockRejectedValue(new Error('SMTP error'));

      // Email queue hatası throw etmemeli
      const result = await service.signup(sampleInput);
      expect(result.tenantId).toBe('tenant-1');
    });
  });

  describe('getStatus()', () => {
    it('mevcut tenant için status döner', async () => {
      mockRepo.findBySlug.mockResolvedValue({
        id: 't-1',
        slug: 'test',
        status: 'trial',
        updatedAt: new Date(),
      });

      const status = await service.getStatus('test');

      expect(status.status).toBe('trial');
      expect(status.subdomain).toBe('test.eticart.com.tr');
      expect(status.message).toContain('hazır');
      expect(status.readyAt).toBeDefined();
    });

    it('olmayan tenant için 404 fırlatır', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);

      await expect(service.getStatus('yok')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('draft durumu için readyAt null döner', async () => {
      mockRepo.findBySlug.mockResolvedValue({
        id: 't-1',
        slug: 'test',
        status: 'draft',
        updatedAt: new Date(),
      });

      const status = await service.getStatus('test');
      expect(status.readyAt).toBeNull();
      expect(status.message).toContain('hazırlanıyor');
    });

    it('overdue durumu için ödeme mesajı döner', async () => {
      mockRepo.findBySlug.mockResolvedValue({
        id: 't-1',
        slug: 'test',
        status: 'overdue',
        updatedAt: new Date(),
      });

      const status = await service.getStatus('test');
      expect(status.message).toContain('Ödeme');
    });
  });

  describe('verifyEmail()', () => {
    it('geçerli token için status günceller', async () => {
      mockRepo.findByVerificationToken.mockResolvedValue({
        id: 't-1',
        slug: 'test',
        status: 'draft',
      });
      mockRepo.updateStatus.mockResolvedValue(undefined);
      mockRepo.markEmailVerified.mockResolvedValue(undefined);
      mockRepo.clearVerificationToken.mockResolvedValue(undefined);

      const result = await service.verifyEmail('valid-token-string-here');

      expect(result.verified).toBe(true);
      expect(result.tenantId).toBe('t-1');
      expect(result.status).toBe('trial');
    });

    it('geçersiz token için 400 fırlatır', async () => {
      mockRepo.findByVerificationToken.mockResolvedValue(null);

      await expect(service.verifyEmail('bad-token')).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('zaten aktif tenant için mevcut status korunur', async () => {
      mockRepo.findByVerificationToken.mockResolvedValue({
        id: 't-1',
        slug: 'test',
        status: 'active',
      });
      mockRepo.markEmailVerified.mockResolvedValue(undefined);
      mockRepo.clearVerificationToken.mockResolvedValue(undefined);

      const result = await service.verifyEmail('valid-token');
      expect(result.status).toBe('active');
      // updateStatus çağrılmamalı
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
    });
  });
});
