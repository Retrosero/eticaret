/**
 * Tenant Onboarding Service — Self-serve signup iş mantığı.
 */
import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { hashPassword } from '@eticart/auth';
import type { TenantStatus } from '@eticart/shared-types';

import { LOGGER_TOKEN } from '../common/logger.js';
import { EMAIL_QUEUE_TOKEN } from '../common/common.module.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { PlansService } from '../plans/plans.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { OnboardingRepository } from './onboarding.repository.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
// Type-only import: test ortamında @eticart/notification-adapters
// runtime import edilmez. Sadece tip düzeyinde bağımlılık.
import type { EmailQueue } from '@eticart/notification-adapters';

import type { z } from 'zod';
import type { signupSchema } from './onboarding.controller.js';

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    private readonly tenantsService: TenantsService,
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    @Inject(EMAIL_QUEUE_TOKEN) private readonly emailQueue: EmailQueue,
    private readonly repo: OnboardingRepository,
    private readonly provisioning: ProvisioningService,
  ) {}

  /**
   * Yeni tenant + ilk admin user kayıt.
   */
  async signup(
    input: z.infer<typeof signupSchema>,
  ): Promise<{
    tenantId: string;
    slug: string;
    subdomain: string;
    status: TenantStatus;
    trialEndsAt: string;
  }> {
    // 1. Slug benzersizliği
    const existing = await this.repo.findBySlug(input.slug);
    if (existing) {
      throw new ApiError(
        409,
        ErrorCode.CONFLICT,
        'Bu mağaza adı zaten kullanılıyor.',
      );
    }

    // 2. Plan doğrulama
    const plan = await this.plans.assertPlanExists(input.planCode as any);

    // 3. Tenant oluştur (draft)
    const tenant = await this.tenantsService.create(
      {
        slug: input.slug,
        name: input.tenantName,
        primaryDomain: null,
        ownerEmail: input.adminEmail,
        metadata: {
          ownerFullName: input.adminFullName,
          signupSource: 'self_serve',
        },
        plan: input.planCode as any,
        trialDays: plan.trialDays,
        region: 'eu-west-1',
        locale: 'tr-TR',
        currency: plan.currency,
      },
      null, // system actor (signup)
    );

    this.logger.info(
      { tenantId: tenant.id, slug: input.slug },
      'Yeni tenant oluşturuldu (signup)',
    );

    // 4. Admin user oluştur
    const passwordHash = await hashPassword(input.adminPassword);
    const adminUserId = await this.repo.createTenantUser({
      tenantId: tenant.id,
      email: input.adminEmail,
      fullName: input.adminFullName,
      passwordHash,
      role: 'owner',
    });

    // 5. Subscription oluştur (trialing)
    const trialEndsAt = new Date(
      Date.now() + plan.trialDays * 24 * 60 * 60 * 1000,
    );
    await this.subscriptions.create(
      {
        tenantId: tenant.id,
        planCode: input.planCode as any,
        billingCycle: 'monthly',
        trialDays: plan.trialDays,
      },
      null, // system actor
    );

    // 6. Verification token üret
    const token = this.generateToken();
    await this.repo.setVerificationToken(tenant.id, this.hashToken(token));

    // 7. Welcome email kuyruğa at
    this.emailQueue
      .enqueue({
        jobId: `tenant-welcome-${tenant.id}-${Date.now()}`,
        event: 'tenant.welcome',
        data: {
          to: input.adminEmail,
          tenantName: input.tenantName,
          adminFullName: input.adminFullName,
          slug: input.slug,
          subdomain: `${input.slug}.eticart.com.tr`,
          verificationUrl: `https://eticart.com.tr/onboarding/verify?token=${token}`,
          trialEndsAt: trialEndsAt.toISOString().split('T')[0],
        },
        templateName: 'tenant_welcome',
        adapterName: 'smtp',
      })
      .catch((err: any) =>
        this.logger.error(
          { err: err?.message, tenantId: tenant.id },
          'Welcome email kuyruğa eklenemedi',
        ),
      );

    // 8. Provisioning job tetikle
    void this.provisioning
      .enqueue({
        tenantId: tenant.id,
        idempotencyKey: `onboarding-${tenant.id}`,
        triggeredBy: null,
      })
      .then((job) => {
        this.logger.info(
          { tenantId: tenant.id, jobId: job.id },
          'Provisioning job kuyruğa eklendi',
        );
        // Hemen çalıştır (async, fire-and-forget)
        return this.provisioning.run(job.id).catch((err) => {
          this.logger.error(
            { err: (err as Error).message, jobId: job.id, tenantId: tenant.id },
            'Provisioning job başarısız',
          );
        });
      })
      .catch((err: any) => {
        this.logger.error(
          { err: err?.message, tenantId: tenant.id },
          'Provisioning enqueue hatası',
        );
      });

    return {
      tenantId: tenant.id,
      slug: input.slug,
      subdomain: `${input.slug}.eticart.com.tr`,
      status: 'draft',
      trialEndsAt: trialEndsAt.toISOString(),
    };
  }

  /**
   * Tenant kurulum durumunu sorgula (public).
   */
  async getStatus(slug: string): Promise<{
    status: TenantStatus;
    subdomain: string;
    message: string;
    readyAt: string | null;
  }> {
    const tenant = await this.repo.findBySlug(slug);
    if (!tenant) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Mağaza bulunamadı.');
    }

    const messages: Record<TenantStatus, string> = {
      draft: 'Mağaza kayıt edildi, hazırlanıyor.',
      provisioning: 'Sunucu kaynakları ayarlanıyor...',
      trial: 'Mağazanız hazır! 14 gün ücretsiz deneyebilirsiniz.',
      active: 'Mağazanız aktif.',
      overdue: 'Ödeme gecikmesi. Lütfen faturanızı ödeyin.',
      suspended: 'Mağaza askıya alındı. Destek ekibiyle iletişime geçin.',
      cancelled: 'Mağaza iptal edildi.',
      archived: 'Mağaza arşivlendi.',
      provisioning_failed:
        'Kurulum başarısız. Destek ekibiyle iletişime geçin.',
    };

    return {
      status: tenant.status as TenantStatus,
      subdomain: `${tenant.slug}.eticart.com.tr`,
      message: messages[tenant.status as TenantStatus] ?? 'Bilinmeyen durum.',
      readyAt:
        tenant.status === 'trial' || tenant.status === 'active'
          ? new Date(tenant.updatedAt).toISOString()
          : null,
    };
  }

  /**
   * Email doğrulama tokeni.
   */
  async verifyEmail(token: string): Promise<{
    verified: boolean;
    tenantId: string;
    status: TenantStatus;
  }> {
    const tokenHash = this.hashToken(token);
    const tenant = await this.repo.findByVerificationToken(tokenHash);
    if (!tenant) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'Geçersiz veya süresi dolmuş token.',
      );
    }

    const newStatus: TenantStatus =
      tenant.status === 'draft' ? 'trial' : (tenant.status as TenantStatus);

    if (newStatus !== tenant.status) {
      await this.repo.updateStatus(tenant.id, newStatus);
    }
    await this.repo.markEmailVerified(tenant.id);
    await this.repo.clearVerificationToken(tenant.id);

    this.logger.info(
      { tenantId: tenant.id, status: newStatus },
      'Tenant email doğrulandı',
    );

    return {
      verified: true,
      tenantId: tenant.id,
      status: newStatus,
    };
  }

  // -------------------------------------------------------------------
  // Dahili
  // -------------------------------------------------------------------

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
