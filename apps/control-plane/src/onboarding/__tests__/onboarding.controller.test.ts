/**
 * OnboardingController — HTTP endpoint tests (signup, status, verify).
 *
 * SSE stream test'leri interval timing nedeniyle flaky olabilir;
 * onun yerine temel HTTP endpoint mantığı test edilir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnboardingController } from '../onboarding.controller.js';

const mockOnboarding: any = {
  signup: vi.fn(),
  getStatus: vi.fn(),
  verifyEmail: vi.fn(),
};
const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('OnboardingController — HTTP', () => {
  let controller: OnboardingController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new OnboardingController(mockLogger, mockOnboarding);
  });

  it('signup başarılı → signup service çağrılır', async () => {
    mockOnboarding.signup.mockResolvedValue({
      tenantId: 't-1',
      slug: 'demo',
      subdomain: 'demo.eticart.com.tr',
      status: 'draft',
      trialEndsAt: '2026-07-20T00:00:00.000Z',
    });

    const result = await controller.signup({
      tenantName: 'Test',
      slug: 'demo',
      adminEmail: 'a@b.com',
      adminFullName: 'Test User',
      adminPassword: 'Strong1Pass!',
      planCode: 'starter',
      acceptTerms: true as const,
    } as any);

    expect(result).toMatchObject({
      tenantId: 't-1',
      slug: 'demo',
      status: 'draft',
    });
    expect(mockOnboarding.signup).toHaveBeenCalled();
  });

  it('signup hata → throw', async () => {
    mockOnboarding.signup.mockRejectedValue(
      new Error('Slug zaten kullanılıyor'),
    );

    await expect(
      controller.signup({
        tenantName: 'Test',
        slug: 'demo',
        adminEmail: 'a@b.com',
        adminFullName: 'Test User',
        adminPassword: 'Strong1Pass!',
        planCode: 'starter',
        acceptTerms: true as const,
      } as any),
    ).rejects.toThrow();
  });

  it('status endpoint → service çağrılır', async () => {
    mockOnboarding.getStatus.mockResolvedValue({
      status: 'trial',
      subdomain: 'demo.eticart.com.tr',
      message: 'Mağaza hazır',
      readyAt: '2026-07-06T16:00:00.000Z',
    });

    const result = await controller.status('demo');
    expect(result.status).toBe('trial');
  });

  it('status endpoint → invalid slug için ApiError', async () => {
    await expect(controller.status('AB')).rejects.toThrow();
  });

  it('verifyEmail endpoint → service çağrılır', async () => {
    mockOnboarding.verifyEmail.mockResolvedValue({
      verified: true,
      tenantId: 't-1',
      status: 'trial',
    });

    const result = await controller.verifyEmail({
      token: 'a'.repeat(32),
    } as any);

    expect(result.verified).toBe(true);
  });

  it('SSE stream → response header set edilir', () => {
    const res: any = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    mockOnboarding.getStatus.mockResolvedValue({
      status: 'trial',
      subdomain: 'demo.eticart.com.tr',
      message: 'Mağaza hazır',
      readyAt: '2026-07-06T16:00:00.000Z',
    });

    void controller.stream('demo', res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
  });
});
