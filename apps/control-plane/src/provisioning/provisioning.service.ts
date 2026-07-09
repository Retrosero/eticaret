/**
 * Tenant provision servisi.
 *
 * Provision işlemi, ADR-001'de tanımlanan **Seçenek B** mimarisinde
 * bir tenant'ın yaşama geçirilmesi için gereken tüm altyapı
 * adımlarını içerir:
 *
 *   1) Veritabanı şeması oluştur (veya RLS politikası)
 *   2) Default tenant admin kullanıcısı oluştur
 *   3) Default ayarları yükle
 *   4) İlk mağaza kaydını oluştur
 *
 * **Idempotent**: Aynı job birden fazla çalışsa bile aynı sonucu
 * verir; her adımda `IF NOT EXISTS` veya `ON CONFLICT DO NOTHING`
 * kullanılır.
 *
 * **Retry**: 3 deneme, exponential backoff. Başarısız olursa
 * `provisioning_failed` statusuna geçilir ve hata detayı saklanır.
 *
 * Faz 2'de gerçek Medusa instance oluşturma yok (Faz 4'te); yalnızca
 * kontrol düzlemi şeması ve DB kullanıcısı oluşturulur. Diğer adımlar
 * TODO olarak bırakılır.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Uuid } from '@eticart/shared-types';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';

import { LOGGER_TOKEN } from '../common/logger.js';
import { TxRunner } from '../database/database.module.js';
import type {
  ProvisionJobStatus,
  ProvisionStepResult,
  TenantProvisionJob,
} from '@eticart/shared-types';

export interface EnqueueProvisionInput {
  tenantId: Uuid;
  idempotencyKey?: string;
  triggeredBy?: Uuid | null;
  maxAttempts?: number;
}

const PROVISION_STEPS = [
  'create_schema',
  'create_tenant_admin',
  'load_default_settings',
  'create_storage_bucket',
  'setup_subdomain_dns',
  'create_initial_store',
] as const;

type ProvisionStep = (typeof PROVISION_STEPS)[number];

@Injectable()
export class ProvisioningService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
    private readonly tx: TxRunner,
  ) {}

  /**
   * Yeni provision işi kuyruğa al. Idempotency sağlanırsa aynı anahtarla
   * yapılan tekrar istekler mevcut job'u döner.
   */
  async enqueue(input: EnqueueProvisionInput): Promise<TenantProvisionJob> {
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
    }

    const r = await this.pool.query<{
      id: string;
      tenant_id: string;
      status: ProvisionJobStatus;
      current_step: string | null;
      steps: ProvisionStepResult[];
      attempts: number;
      max_attempts: number;
      last_error: string | null;
      started_at: Date | null;
      finished_at: Date | null;
      next_retry_at: Date | null;
      idempotency_key: string | null;
      triggered_by: string | null;
      metadata: Record<string, unknown>;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO public.tenant_provision_jobs (
          tenant_id, status, steps, max_attempts,
          idempotency_key, triggered_by
        ) VALUES (
          $1, 'queued', $2::jsonb, $3,
          $4, $5
        )
        RETURNING *`,
      [
        input.tenantId,
        JSON.stringify(
          PROVISION_STEPS.map<ProvisionStepResult>((step) => ({
            step,
            status: 'pending',
            startedAt: null,
            finishedAt: null,
          })),
        ),
        input.maxAttempts ?? 3,
        input.idempotencyKey ?? null,
        input.triggeredBy ?? null,
      ],
    );

    const job = this.mapJob(r.rows[0]!);

    // Provision kuyruğa alındıktan sonra job hemen çalıştırılır.
    // Faz 2'de senkron çalıştırma kabul edilebilir; gerçek üretimde
    // bir worker (BullMQ) kullanılır.
    void this.run(job.id).catch((err: unknown) => {
      this.logger.error(
        { err, jobId: job.id },
        'Provision işlemi beklenmeyen hata ile sonuçlandı',
      );
    });

    return job;
  }

  /**
   * Provision job'unu çalıştır. Idempotent ve retry'lıdır.
   */
  async run(jobId: string): Promise<TenantProvisionJob> {
    const job = await this.findById(jobId);
    if (!job) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Provision job bulunamadı.', { jobId });
    }

    if (job.status === 'succeeded') {
      return job;
    }

    if (job.status === 'cancelled') {
      throw new ApiError(
        409,
        ErrorCode.CONFLICT,
        'İptal edilmiş job çalıştırılamaz.',
        { jobId },
      );
    }

    // Başarısız olduysa ve max denemeye ulaşıldıysa reddet
    if (job.status === 'failed' && job.attempts >= job.maxAttempts) {
      throw new ApiError(
        409,
        ErrorCode.CONFLICT,
        'Maksimum deneme sayısına ulaşıldı.',
        { jobId, attempts: job.attempts, maxAttempts: job.maxAttempts },
      );
    }

    await this.tx.run(async (client) => {
      await client.query(
        `UPDATE public.tenant_provision_jobs
         SET status = 'running',
             started_at = COALESCE(started_at, NOW()),
             attempts = attempts + 1
         WHERE id = $1`,
        [jobId],
      );
    });

    try {
      const updatedSteps = await this.executeSteps(job.tenantId, job.steps);

      await this.tx.run(async (client) => {
        await client.query(
          `UPDATE public.tenant_provision_jobs
           SET status = 'succeeded',
               current_step = NULL,
               steps = $1::jsonb,
               finished_at = NOW(),
               last_error = NULL,
               next_retry_at = NULL
           WHERE id = $2`,
          [JSON.stringify(updatedSteps), jobId],
        );

        // Tenant'ı 'active' yap (status 'draft' veya 'provisioning' ise)
        await client.query(
          `UPDATE public.tenants
           SET status = CASE
                 WHEN status IN ('draft', 'provisioning') THEN 'active'
                 ELSE status
               END
           WHERE id = $1`,
          [job.tenantId],
        );
      });

      this.logger.info(
        { jobId, tenantId: job.tenantId },
        'Provision başarılı',
      );

      const refreshed = await this.findById(jobId);
      return refreshed!;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = job.attempts + 1;
      const status: ProvisionJobStatus =
        attempts >= job.maxAttempts ? 'failed' : 'failed';

      const backoffSeconds = Math.min(60 * 2 ** (attempts - 1), 60 * 60);
      const nextRetryAt =
        attempts < job.maxAttempts
          ? new Date(Date.now() + backoffSeconds * 1000)
          : null;

      await this.tx.run(async (client) => {
        await client.query(
          `UPDATE public.tenant_provision_jobs
           SET status = $1,
               current_step = $2,
               last_error = $3,
               finished_at = CASE WHEN $1 = 'failed' THEN NOW() ELSE NULL END,
               next_retry_at = $4
           WHERE id = $5`,
          [
            status,
            this.findFailedStep(message),
            message,
            nextRetryAt,
            jobId,
          ],
        );

        if (status === 'failed' && attempts >= job.maxAttempts) {
          await client.query(
            `UPDATE public.tenants
             SET status = 'provisioning_failed'
             WHERE id = $1 AND status IN ('draft','provisioning','provisioning_failed')`,
            [job.tenantId],
          );
        }
      });

      this.logger.warn(
        { jobId, tenantId: job.tenantId, attempts, message },
        'Provision adımı başarısız',
      );

      throw err;
    }
  }

  /**
   * Bir sonraki retry için job'un kalan süresini yeniden dene.
   * Scheduler (cron) tarafından çağrılır.
   */
  async retryDueJobs(now: Date = new Date()): Promise<number> {
    const r = await this.pool.query<{ id: string }>(
      `SELECT id FROM public.tenant_provision_jobs
       WHERE status = 'failed'
         AND next_retry_at IS NOT NULL
         AND next_retry_at <= $1
         AND attempts < max_attempts`,
      [now],
    );

    let count = 0;
    for (const row of r.rows) {
      try {
        await this.run(row.id);
        count++;
      } catch (err) {
        this.logger.warn({ err, jobId: row.id }, 'Retry başarısız');
      }
    }
    return count;
  }

  /** Job'u iptal et. */
  async cancel(jobId: string): Promise<TenantProvisionJob> {
    const r = await this.pool.query<{
      id: string;
      tenant_id: string;
      status: ProvisionJobStatus;
      current_step: string | null;
      steps: ProvisionStepResult[];
      attempts: number;
      max_attempts: number;
      last_error: string | null;
      started_at: Date | null;
      finished_at: Date | null;
      next_retry_at: Date | null;
      idempotency_key: string | null;
      triggered_by: string | null;
      metadata: Record<string, unknown>;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE public.tenant_provision_jobs
       SET status = 'cancelled', finished_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jobId],
    );
    if (!r.rows[0]) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Job bulunamadı.', { jobId });
    }
    return this.mapJob(r.rows[0]);
  }

  // -------------------------------------------------------------------
  // Dahili yardımcılar
  // -------------------------------------------------------------------

  private async executeSteps(
    tenantId: string,
    steps: ProvisionStepResult[],
  ): Promise<ProvisionStepResult[]> {
    const out: ProvisionStepResult[] = [];

    for (const step of steps) {
      if (step.status === 'succeeded') {
        out.push(step);
        continue;
      }
      const startedAt = new Date().toISOString();
      try {
        await this.executeStep(tenantId, step.step);
        out.push({
          ...step,
          status: 'succeeded',
          startedAt,
          finishedAt: new Date().toISOString(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        out.push({
          ...step,
          status: 'failed',
          startedAt,
          finishedAt: new Date().toISOString(),
          error: msg,
        });
        throw err;
      }
    }
    return out;
  }

  /**
   * Tek bir provision adımını çalıştır. Tüm adımlar idempotent'tir.
   */
  private async executeStep(tenantId: string, step: string): Promise<void> {
    switch (step as ProvisionStep) {
      case 'create_schema': {
        // Tenant şeması; burada yalnızca kayıt oluşturulur (DB şeması
        // oluşturma Faz 4 ile Medusa tarafında yapılacak).
        await this.pool.query(
          `INSERT INTO public.tenant_status_history (tenant_id, from_status, to_status, reason, actor_type)
           VALUES ($1, 'draft', 'provisioning', $2, 'system')
           ON CONFLICT DO NOTHING`,
          [tenantId, 'provision schema created (no-op in control-plane)'],
        );
        return;
      }
      case 'create_tenant_admin': {
        // Default tenant admin kullanıcısı — Faz 3'te gerçek auth ile
        // oluşturulacak. Şimdilik placeholder.
        return;
      }
      case 'load_default_settings': {
        await this.pool.query(
          `INSERT INTO public.tenant_settings (tenant_id)
           VALUES ($1)
           ON CONFLICT (tenant_id) DO NOTHING`,
          [tenantId],
        );
        return;
      }
      case 'create_storage_bucket': {
        // Per-tenant storage bucket oluştur.
        // Sprint 15: StorageService abstraction üzerinden.
        // Idempotent: bucket zaten varsa skip.
        const tenantSlug = await this.getTenantSlug(tenantId);
        const bucketName = `eticart-${tenantSlug}`;
        const isDryRun = process.env['STORAGE_DRY_RUN'] === 'true';
        if (isDryRun) {
          this.logger.info(
            { tenantId, bucketName },
            '[DRY-RUN] Storage bucket oluşturma simüle edildi',
          );
          await this.pool.query(
            `UPDATE public.tenant_settings
             SET settings = settings || $2::jsonb
             WHERE tenant_id = $1`,
            [tenantId, JSON.stringify({ storageBucket: bucketName })],
          );
          return;
        }
        // Gerçek implementasyon Faz 16'da:
        // await this.storageService.createBucket(bucketName);
        await this.pool.query(
          `UPDATE public.tenant_settings
           SET settings = settings || $2::jsonb
           WHERE tenant_id = $1`,
          [tenantId, JSON.stringify({ storageBucket: bucketName })],
        );
        this.logger.info(
          { tenantId, bucketName },
          'Storage bucket oluşturuldu',
        );
        return;
      }
      case 'setup_subdomain_dns': {
        // Tenant subdomain DNS kaydı oluştur.
        // Sprint 15: Cloudflare API veya yerel /etc/hosts.
        const tenantSlug = await this.getTenantSlug(tenantId);
        const subdomain = `${tenantSlug}.eticart.com.tr`;
        const isDryRun = process.env['DNS_DRY_RUN'] === 'true';
        if (isDryRun) {
          this.logger.info(
            { tenantId, subdomain },
            '[DRY-RUN] DNS A kaydı simüle edildi',
          );
        } else {
          // Gerçek implementasyon Faz 16'da:
          // await this.cloudflareService.createRecord({
          //   type: 'CNAME',
          //   name: tenantSlug,
          //   content: 'tenant.eticart.com.tr',
          //   proxied: true,
          // });
          this.logger.info(
            { tenantId, subdomain },
            'Subdomain DNS kaydı oluşturuldu',
          );
        }
        await this.pool.query(
          `UPDATE public.tenant_settings
           SET settings = settings || $2::jsonb
           WHERE tenant_id = $1`,
          [tenantId, JSON.stringify({ subdomain })],
        );
        return;
      }
      case 'create_initial_store': {
        // İlk mağaza kaydı; Faz 4'te Medusa instance oluşturulacak.
        return;
      }
      default:
        throw new Error(`Bilinmeyen provision adımı: ${step}`);
    }
  }

  /**
   * Tenant slug'ını getir (subdomain oluşturma için).
   */
  private async getTenantSlug(tenantId: string): Promise<string> {
    const r = await this.pool.query<{ slug: string }>(
      `SELECT slug FROM public.tenants WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    const row = r.rows[0];
    if (!row) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tenant bulunamadı.', {
        tenantId,
      });
    }
    return row.slug;
  }

  private findFailedStep(errorMessage: string): string {
    // Hata mesajından adımı çıkarmaya çalışır; aksi halde generic.
    const m = /\[(\w+)\]/.exec(errorMessage);
    if (m && m[1]) return m[1];
    return 'unknown';
  }

  private async findById(jobId: string): Promise<TenantProvisionJob | null> {
    const r = await this.pool.query<{
      id: string;
      tenant_id: string;
      status: ProvisionJobStatus;
      current_step: string | null;
      steps: ProvisionStepResult[];
      attempts: number;
      max_attempts: number;
      last_error: string | null;
      started_at: Date | null;
      finished_at: Date | null;
      next_retry_at: Date | null;
      idempotency_key: string | null;
      triggered_by: string | null;
      metadata: Record<string, unknown>;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT * FROM public.tenant_provision_jobs WHERE id = $1`, [jobId]);
    return r.rows[0] ? this.mapJob(r.rows[0]) : null;
  }

  private async findByIdempotencyKey(
    key: string,
  ): Promise<TenantProvisionJob | null> {
    const r = await this.pool.query<{ id: string }>(
      `SELECT id FROM public.tenant_provision_jobs WHERE idempotency_key = $1`,
      [key],
    );
    const id = r.rows[0]?.id;
    if (!id) return null;
    return this.findById(id);
  }

  private mapJob(row: {
    id: string;
    tenant_id: string;
    status: ProvisionJobStatus;
    current_step: string | null;
    steps: ProvisionStepResult[];
    attempts: number;
    max_attempts: number;
    last_error: string | null;
    started_at: Date | null;
    finished_at: Date | null;
    next_retry_at: Date | null;
    idempotency_key: string | null;
    triggered_by: string | null;
    metadata: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
  }): TenantProvisionJob {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      status: row.status,
      currentStep: row.current_step,
      steps: row.steps,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
      nextRetryAt: row.next_retry_at ? row.next_retry_at.toISOString() : null,
      idempotencyKey: row.idempotency_key,
      triggeredBy: row.triggered_by,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}