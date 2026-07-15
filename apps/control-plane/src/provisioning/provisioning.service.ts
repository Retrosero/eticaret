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

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Uuid } from '@eticart/shared-types';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';
import { hashPassword } from '@eticart/auth';

import { LOGGER_TOKEN } from '../common/logger.js';
import { TxRunner } from '../database/database.module.js';
import { schemaNameFromSlug } from '../shared/slug.js';
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

const APP_TEMPLATE_TABLES = [
  'customers',
  'kvkk_audit',
  'orders',
  'product_variants',
  'products',
] as const;

interface TenantAdminTenantRow {
  slug: string;
  name: string;
  locale: string;
  currency: string;
  primary_domain: string | null;
  metadata: Record<string, unknown>;
}

interface TenantDirectoryUserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: string;
  status: string;
}

interface PlatformUserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string | null;
  role: string;
  status: string;
  tenant_id: string | null;
}

interface TenantSettingsRow {
  invoice_settings: Record<string, unknown>;
  email_settings: Record<string, unknown>;
  shipping_settings: Record<string, unknown>;
  custom_settings: Record<string, unknown>;
}

interface MenuSeedItem {
  label: string;
  href: string;
  external?: boolean;
  children?: MenuSeedItem[];
}

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
        const tenantSlug = await this.getTenantSlug(tenantId);
        await this.ensureTenantSchema(tenantSlug);
        await this.pool.query(
          `INSERT INTO public.tenant_status_history (tenant_id, from_status, to_status, reason, actor_type)
           VALUES ($1, 'draft', 'provisioning', $2, 'system')
           ON CONFLICT DO NOTHING`,
          [tenantId, `tenant schema created: ${tenantSlug}`],
        );
        return;
      }
      case 'create_tenant_admin': {
        await this.ensureTenantAdmin(tenantId);
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
        await this.ensureInitialStore(tenantId);
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

  private async ensureTenantSchema(tenantSlug: string): Promise<void> {
    const schema = schemaNameFromSlug(tenantSlug);
    if (!schema) {
      throw new ApiError(400, ErrorCode.BAD_REQUEST, 'Tenant slug gecersiz.', {
        tenantSlug,
      });
    }

    const quotedSchema = `"${schema}"`;

    await this.pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);

    for (const tableName of APP_TEMPLATE_TABLES) {
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS ${quotedSchema}."${tableName}" (LIKE app_template."${tableName}" INCLUDING ALL)`,
      );
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${quotedSchema}.brands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${quotedSchema}.categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        parent_id UUID,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${quotedSchema}.order_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number TEXT NOT NULL UNIQUE,
        order_id UUID NOT NULL,
        invoice_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'issued',
        currency TEXT NOT NULL DEFAULT 'TRY',
        total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
        tax_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
        issued_at TIMESTAMPTZ,
        external_uuid TEXT,
        e_invoice_status TEXT,
        e_fatura_provider TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const patchStatements = [
      `ALTER TABLE ${quotedSchema}.products ADD COLUMN IF NOT EXISTS short_description TEXT`,
      `ALTER TABLE ${quotedSchema}.products ADD COLUMN IF NOT EXISTS long_description TEXT`,
      `ALTER TABLE ${quotedSchema}.products ADD COLUMN IF NOT EXISTS brand_id UUID`,
      `ALTER TABLE ${quotedSchema}.products ADD COLUMN IF NOT EXISTS category_id UUID`,
      `ALTER TABLE ${quotedSchema}.products ADD COLUMN IF NOT EXISTS tax_category_id UUID`,
      `ALTER TABLE ${quotedSchema}.products ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`,
      `ALTER TABLE ${quotedSchema}.product_variants ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(15, 2)`,
      `ALTER TABLE ${quotedSchema}.product_variants ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(15, 2)`,
      `ALTER TABLE ${quotedSchema}.product_variants ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'`,
      `ALTER TABLE ${quotedSchema}.product_variants ADD COLUMN IF NOT EXISTS weight TEXT`,
      `ALTER TABLE ${quotedSchema}.product_variants ADD COLUMN IF NOT EXISTS barcode TEXT`,
      `ALTER TABLE ${quotedSchema}.product_variants ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE ${quotedSchema}.customers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
      `ALTER TABLE ${quotedSchema}.customers ADD COLUMN IF NOT EXISTS total_orders INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE ${quotedSchema}.customers ADD COLUMN IF NOT EXISTS total_spent NUMERIC(15, 2) NOT NULL DEFAULT 0`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS order_number TEXT`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS customer_email TEXT`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS customer_name TEXT`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(15, 2) NOT NULL DEFAULT 0`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS tax_total NUMERIC(15, 2) NOT NULL DEFAULT 0`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS shipping_total NUMERIC(15, 2) NOT NULL DEFAULT 0`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS discount_total NUMERIC(15, 2) NOT NULL DEFAULT 0`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS grand_total NUMERIC(15, 2) NOT NULL DEFAULT 0`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS payment_provider TEXT`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS payment_reference TEXT`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE ${quotedSchema}.orders ADD COLUMN IF NOT EXISTS placed_at TIMESTAMPTZ`,
    ];

    for (const statement of patchStatements) {
      await this.pool.query(statement);
    }
  }

  private async ensureTenantAdmin(tenantId: string): Promise<void> {
    await this.ensureTenantUserSchema();

    const tenant = await this.getTenantAdminTenant(tenantId);
    const tenantUser = await this.getTenantDirectoryUser(tenantId);
    const platformUser = await this.getPlatformTenantUser(tenantId);
    const fallbackEmail = this.readMetadataString(tenant.metadata, 'ownerEmail');
    const fallbackFullName =
      this.readMetadataString(tenant.metadata, 'ownerFullName') ?? `${tenant.name} Admin`;

    const source = await this.resolveTenantAdminSource({
      tenantId,
      tenant,
      tenantUser,
      platformUser,
      fallbackEmail,
      fallbackFullName,
    });

    const existingUserByEmail = await this.pool.query<PlatformUserRow>(
      `SELECT id, email, full_name, password_hash, role, status, tenant_id
       FROM public.users
       WHERE lower(email) = $1
       LIMIT 1`,
      [source.email],
    );
    const existingUser = existingUserByEmail.rows[0];
    if (existingUser?.tenant_id && existingUser.tenant_id !== tenantId) {
      throw new ApiError(
        409,
        ErrorCode.CONFLICT,
        'Tenant admin e-postasi baska bir kiraciya ait.',
        { tenantId, email: source.email, userId: existingUser.id },
      );
    }

    await this.pool.query(
      `INSERT INTO public.tenant_users
        (tenant_id, email, full_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())
       ON CONFLICT (tenant_id, email)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         status = 'active',
         updated_at = NOW()`,
      [tenantId, source.email, source.fullName, source.passwordHash, source.tenantRole],
    );

    await this.pool.query(
      `INSERT INTO public.users
        (email, full_name, role, tenant_id, password_hash, email_verified, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, 'active', NOW(), NOW())
       ON CONFLICT (email)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         tenant_id = EXCLUDED.tenant_id,
         password_hash = EXCLUDED.password_hash,
         status = 'active',
         updated_at = NOW()`,
      [source.email, source.fullName, source.platformRole, tenantId, source.passwordHash],
    );

    await this.pool.query(
      `UPDATE public.tenants
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        tenantId,
        JSON.stringify({
          ownerEmail: source.email,
          ownerFullName: source.fullName,
          adminProvisioning: {
            status: 'ready',
            provisionedAt: new Date().toISOString(),
            source: source.source,
          },
        }),
      ],
    );
  }

  private async ensureTenantUserSchema(): Promise<void> {
    await this.pool.query(
      `ALTER TABLE public.tenant_users
       ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'`,
    );
  }

  private async getTenantAdminTenant(tenantId: string): Promise<TenantAdminTenantRow> {
    const result = await this.pool.query<TenantAdminTenantRow>(
      `SELECT slug, name, locale, currency, primary_domain, metadata
       FROM public.tenants
       WHERE id = $1
       LIMIT 1`,
      [tenantId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tenant bulunamadi.', { tenantId });
    }
    return {
      ...row,
      metadata: row.metadata ?? {},
    };
  }

  private async getTenantDirectoryUser(
    tenantId: string,
  ): Promise<TenantDirectoryUserRow | null> {
    const result = await this.pool.query<TenantDirectoryUserRow>(
      `SELECT id, email, full_name, password_hash, role, status
       FROM public.tenant_users
       WHERE tenant_id = $1
       ORDER BY
         CASE role
           WHEN 'owner' THEN 0
           WHEN 'admin' THEN 1
           ELSE 2
         END,
         created_at ASC
       LIMIT 1`,
      [tenantId],
    );
    return result.rows[0] ?? null;
  }

  private async getPlatformTenantUser(tenantId: string): Promise<PlatformUserRow | null> {
    const result = await this.pool.query<PlatformUserRow>(
      `SELECT id, email, full_name, password_hash, role, status, tenant_id
       FROM public.users
       WHERE tenant_id = $1
       ORDER BY
         CASE role
           WHEN 'tenant_owner' THEN 0
           WHEN 'tenant_admin' THEN 1
           ELSE 2
         END,
         created_at ASC
       LIMIT 1`,
      [tenantId],
    );
    return result.rows[0] ?? null;
  }

  private async resolveTenantAdminSource(input: {
    tenantId: string;
    tenant: TenantAdminTenantRow;
    tenantUser: TenantDirectoryUserRow | null;
    platformUser: PlatformUserRow | null;
    fallbackEmail: string | null;
    fallbackFullName: string;
  }): Promise<{
    email: string;
    fullName: string;
    passwordHash: string;
    tenantRole: string;
    platformRole: string;
    source: 'tenant_users' | 'public_users' | 'tenant_metadata';
  }> {
    if (input.tenantUser) {
      return {
        email: input.tenantUser.email.trim().toLowerCase(),
        fullName: input.tenantUser.full_name,
        passwordHash: input.tenantUser.password_hash,
        tenantRole: this.normalizeTenantDirectoryRole(input.tenantUser.role),
        platformRole: this.toPlatformRole(input.tenantUser.role),
        source: 'tenant_users',
      };
    }

    if (input.platformUser) {
      return {
        email: input.platformUser.email.trim().toLowerCase(),
        fullName: input.platformUser.full_name,
        passwordHash:
          input.platformUser.password_hash ??
          (await this.createPlaceholderPasswordHash(input.tenant.slug)),
        tenantRole: this.toTenantDirectoryRole(input.platformUser.role),
        platformRole: this.normalizePlatformRole(input.platformUser.role),
        source: 'public_users',
      };
    }

    if (input.fallbackEmail) {
      return {
        email: input.fallbackEmail.trim().toLowerCase(),
        fullName: input.fallbackFullName,
        passwordHash: await this.createPlaceholderPasswordHash(input.tenant.slug),
        tenantRole: 'owner',
        platformRole: 'tenant_owner',
        source: 'tenant_metadata',
      };
    }

    throw new ApiError(
      409,
      ErrorCode.CONFLICT,
      'Tenant admin kullanicisi icin gerekli bilgi bulunamadi.',
      { tenantId: input.tenantId },
    );
  }

  private normalizeTenantDirectoryRole(role: string): string {
    if (role === 'owner' || role === 'admin' || role === 'staff') {
      return role;
    }
    return 'owner';
  }

  private normalizePlatformRole(role: string): string {
    if (role === 'tenant_owner' || role === 'tenant_admin' || role === 'tenant_staff') {
      return role;
    }
    return 'tenant_owner';
  }

  private toPlatformRole(role: string): string {
    switch (role) {
      case 'admin':
        return 'tenant_admin';
      case 'staff':
        return 'tenant_staff';
      default:
        return 'tenant_owner';
    }
  }

  private toTenantDirectoryRole(role: string): string {
    switch (role) {
      case 'tenant_admin':
        return 'admin';
      case 'tenant_staff':
        return 'staff';
      default:
        return 'owner';
    }
  }

  private readMetadataString(
    metadata: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = metadata[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private async createPlaceholderPasswordHash(tenantSlug: string): Promise<string> {
    return hashPassword(`Tmp!${tenantSlug}-${randomUUID()}Aa1`);
  }

  private async ensureInitialStore(tenantId: string): Promise<void> {
    const tenant = await this.getTenantAdminTenant(tenantId);
    const baseDomain = process.env['ETICART_BASE_DOMAIN'] ?? 'eticart.com.tr';
    const storefrontDomain = tenant.primary_domain ?? `${tenant.slug}.${baseDomain}`;
    const supportEmail =
      this.readMetadataString(tenant.metadata, 'ownerEmail') ??
      `destek@${tenant.slug}.${baseDomain}`;

    const settingsRows = await this.pool.query<TenantSettingsRow>(
      `SELECT invoice_settings, email_settings, shipping_settings, custom_settings
       FROM public.tenant_settings
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId],
    );
    const currentSettings = settingsRows.rows[0] ?? {
      invoice_settings: {},
      email_settings: {},
      shipping_settings: {},
      custom_settings: {},
    };

    const mergedInvoiceSettings = this.mergeRecordDefaults(currentSettings.invoice_settings ?? {}, {
      invoicePrefix: 'FTR',
      invoiceSeries: String(new Date().getUTCFullYear()),
      defaultCurrency: tenant.currency,
      defaultTaxRate: 20,
      taxCategories: [
        { id: 'tax-standard', name: 'Genel KDV', rate: 20 },
        { id: 'tax-reduced', name: 'Indirimli KDV', rate: 10 },
        { id: 'tax-zero', name: 'Sifir KDV', rate: 0 },
      ],
    });
    const mergedEmailSettings = this.mergeRecordDefaults(currentSettings.email_settings ?? {}, {
      fromName: tenant.name,
      fromEmail: supportEmail,
      replyTo: supportEmail,
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
    });
    const mergedShippingSettings = this.mergeRecordDefaults(currentSettings.shipping_settings ?? {}, {
      originCity: 'Istanbul',
      freeShippingLimit: 1500,
      defaultProvider: 'manual',
      manual: {
        enabled: true,
        label: 'Standart Teslimat',
        etaText: '1-3 is gunu',
      },
      yurtici: {
        enabled: false,
        apiKey: '',
        apiSecret: '',
        customerCode: '',
      },
      mng: {
        enabled: false,
        apiKey: '',
        apiSecret: '',
        customerCode: '',
      },
      aras: {
        enabled: false,
        apiKey: '',
        apiSecret: '',
        customerCode: '',
      },
    });
    const mergedCustomSettings = this.mergeRecordDefaults(currentSettings.custom_settings ?? {}, {
      storeInfo: {
        storeName: tenant.name,
        brandName: tenant.name,
        description: `${tenant.name} resmi online magaza deneyimi.`,
        logoUrl: '',
        logoDarkUrl: '',
        faviconUrl: '',
        supportEmail,
        supportPhone: '',
        website: `https://${storefrontDomain}`,
        address: '',
        taxOffice: '',
        taxNumber: '',
        mersisNo: '',
        tradeRegistryNo: '',
      },
      payments: {
        manualBankTransfer: {
          enabled: true,
          iban: '',
          accountName: tenant.name,
          bankName: '',
        },
        cashOnDelivery: {
          enabled: false,
          extraFee: 0,
        },
        iyzico: {
          enabled: false,
          apiKey: '',
          apiSecret: '',
          merchantId: '',
          merchantSalt: '',
          callbackKey: '',
        },
        paytr: {
          enabled: false,
          apiKey: '',
          apiSecret: '',
          merchantId: '',
          merchantSalt: '',
          callbackKey: '',
        },
        param: {
          enabled: false,
          apiKey: '',
          apiSecret: '',
          merchantId: '',
          merchantSalt: '',
          callbackKey: '',
        },
      },
      notifications: {
        newOrderEmail: true,
        invoiceEmail: true,
        lowStockEmail: true,
        newCustomerEmail: false,
        campaignEmail: false,
      },
    });

    await this.pool.query(
      `INSERT INTO public.tenant_settings
        (tenant_id, invoice_settings, email_settings, shipping_settings, custom_settings, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, NOW())
       ON CONFLICT (tenant_id)
       DO UPDATE SET
         invoice_settings = EXCLUDED.invoice_settings,
         email_settings = EXCLUDED.email_settings,
         shipping_settings = EXCLUDED.shipping_settings,
         custom_settings = EXCLUDED.custom_settings,
         updated_at = NOW()`,
      [
        tenantId,
        JSON.stringify(mergedInvoiceSettings),
        JSON.stringify(mergedEmailSettings),
        JSON.stringify(mergedShippingSettings),
        JSON.stringify(mergedCustomSettings),
      ],
    );

    await this.pool.query(
      `INSERT INTO public.seo_settings
        (tenant_id, title_template, default_title, default_description, robots, sitemap_enabled, canonical_base, scripts, updated_at)
       VALUES ($1, $2, $3, $4, 'index, follow', TRUE, $5, '[]'::jsonb, NOW())
       ON CONFLICT (tenant_id)
       DO UPDATE SET
         title_template = COALESCE(NULLIF(public.seo_settings.title_template, ''), EXCLUDED.title_template),
         default_title = COALESCE(NULLIF(public.seo_settings.default_title, ''), EXCLUDED.default_title),
         default_description = COALESCE(NULLIF(public.seo_settings.default_description, ''), EXCLUDED.default_description),
         canonical_base = COALESCE(public.seo_settings.canonical_base, EXCLUDED.canonical_base),
         updated_at = NOW()`,
      [
        tenantId,
        `%s | ${tenant.name}`,
        tenant.name,
        `${tenant.name} icin hazirlanan online magaza vitrini.`,
        `https://${storefrontDomain}`,
      ],
    );

    const themeVersionRows = await this.pool.query<{ version: string }>(
      `SELECT version
       FROM public.theme_versions
       WHERE theme_id = 'modern'
       ORDER BY released_at DESC
       LIMIT 1`,
    );
    const activeThemeRows = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM public.tenant_theme_assignments
       WHERE tenant_id = $1 AND status = 'active'
       LIMIT 1`,
      [tenantId],
    );
    if (!activeThemeRows.rows[0]) {
      await this.pool.query(
        `INSERT INTO public.tenant_theme_assignments
          (tenant_id, theme_id, theme_version, status, overrides, logo_url, favicon_url, activated_at, created_at, updated_at)
         VALUES ($1, 'modern', $2, 'active', '{}'::jsonb, NULL, NULL, NOW(), NOW(), NOW())`,
        [tenantId, themeVersionRows.rows[0]?.version ?? '1.0.0'],
      );
    }

    const headerMenuId = await this.ensureNavigationMenu(
      tenantId,
      'header',
      this.defaultHeaderMenuItems(),
    );
    const footerMenuId = await this.ensureNavigationMenu(
      tenantId,
      'footer',
      this.defaultFooterMenuItems(),
    );
    void headerMenuId;
    void footerMenuId;

    await this.ensureHomePage(tenantId, tenant.name);
  }

  private mergeRecordDefaults(
    existing: Record<string, unknown>,
    defaults: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(defaults)) {
      const current = merged[key];
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        current &&
        typeof current === 'object' &&
        !Array.isArray(current)
      ) {
        merged[key] = this.mergeRecordDefaults(
          current as Record<string, unknown>,
          value as Record<string, unknown>,
        );
        continue;
      }
      if (current === undefined || current === null) {
        merged[key] = value;
      }
    }
    return merged;
  }

  private async ensureNavigationMenu(
    tenantId: string,
    type: 'header' | 'footer',
    items: MenuSeedItem[],
  ): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO public.navigation_menus (tenant_id, type, status, created_at, updated_at)
       VALUES ($1, $2, 'published', NOW(), NOW())
       ON CONFLICT (tenant_id, type)
       DO UPDATE SET status = 'published', updated_at = NOW()
       RETURNING id`,
      [tenantId, type],
    );
    const menuId = result.rows[0]?.id;
    if (!menuId) {
      throw new ApiError(500, ErrorCode.INTERNAL_SERVER_ERROR, 'Navigasyon menusu olusturulamadi.');
    }

    const countRows = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM public.navigation_menu_items
       WHERE menu_id = $1`,
      [menuId],
    );
    if (Number(countRows.rows[0]?.count ?? '0') > 0) {
      return menuId;
    }

    await this.insertMenuItems(menuId, items);
    return menuId;
  }

  private async insertMenuItems(
    menuId: string,
    items: MenuSeedItem[],
    parentId: string | null = null,
  ): Promise<void> {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;
      const itemId = randomUUID();
      await this.pool.query(
        `INSERT INTO public.navigation_menu_items
          (id, menu_id, parent_id, label, href, external, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [itemId, menuId, parentId, item.label, item.href, item.external ?? false, index],
      );
      if (item.children?.length) {
        await this.insertMenuItems(menuId, item.children, itemId);
      }
    }
  }

  private defaultHeaderMenuItems(): MenuSeedItem[] {
    return [
      { label: 'Anasayfa', href: '/' },
      { label: 'Yeni Gelenler', href: '/koleksiyon/yeni' },
      { label: 'Kadin', href: '/kategori/kadin' },
      { label: 'Erkek', href: '/kategori/erkek' },
      { label: 'Indirim', href: '/koleksiyon/indirim' },
      { label: 'Iletisim', href: '/iletisim' },
    ];
  }

  private defaultFooterMenuItems(): MenuSeedItem[] {
    return [
      { label: 'Hakkimizda', href: '/hakkimizda' },
      { label: 'Teslimat ve Iade', href: '/teslimat-ve-iade' },
      { label: 'KVKK', href: '/kvkk' },
      { label: 'Iletisim', href: '/iletisim' },
    ];
  }

  private async ensureHomePage(tenantId: string, tenantName: string): Promise<void> {
    const pageRows = await this.pool.query<{
      id: string;
      current_revision_id: string | null;
    }>(
      `SELECT id, current_revision_id
       FROM public.pages
       WHERE tenant_id = $1 AND slug = 'home' AND type = 'home'
       LIMIT 1`,
      [tenantId],
    );
    const existingPage = pageRows.rows[0];

    let pageId = existingPage?.id;
    if (!pageId) {
      const insertedPage = await this.pool.query<{ id: string }>(
        `INSERT INTO public.pages
          (tenant_id, slug, title, type, status, created_at, updated_at)
         VALUES ($1, 'home', $2, 'home', 'published', NOW(), NOW())
         RETURNING id`,
        [tenantId, tenantName],
      );
      pageId = insertedPage.rows[0]?.id;
    }

    if (!pageId) {
      throw new ApiError(500, ErrorCode.INTERNAL_SERVER_ERROR, 'Ana sayfa kaydi olusturulamadi.');
    }

    if (!existingPage?.current_revision_id) {
      const revisionRows = await this.pool.query<{ id: string }>(
        `INSERT INTO public.page_revisions
          (page_id, version, blocks, author_id, note, created_at)
         VALUES ($1, 1, $2::jsonb, NULL, $3, NOW())
         RETURNING id`,
        [
          pageId,
          JSON.stringify(this.defaultHomePageBlocks(tenantName)),
          'Provisioning default home page',
        ],
      );
      const revisionId = revisionRows.rows[0]?.id;
      if (!revisionId) {
        throw new ApiError(500, ErrorCode.INTERNAL_SERVER_ERROR, 'Ana sayfa revizyonu olusturulamadi.');
      }

      await this.pool.query(
        `UPDATE public.pages
         SET current_revision_id = $2,
             status = 'published',
             updated_at = NOW()
         WHERE id = $1`,
        [pageId, revisionId],
      );
    }
  }

  private defaultHomePageBlocks(tenantName: string): Array<Record<string, unknown>> {
    return [
      {
        id: 'hero',
        type: 'hero',
        order: 0,
        settings: {
          title: tenantName,
          subtitle: 'Yeni magazaniz yayina hazir. Kategorileri ve urunleri yonetim panelinden duzenleyebilirsiniz.',
          ctaLabel: 'Alisverise Basla',
          ctaHref: '/kategori/yeni',
        },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'featured-products',
        type: 'featured-products',
        order: 1,
        settings: {
          title: 'One Cikan Urunler',
          limit: 8,
          cardVariant: 'horizontal',
        },
        visibility: { desktop: true, mobile: true },
      },
      {
        id: 'newsletter',
        type: 'newsletter',
        order: 2,
        settings: {
          title: 'Kampanyalari Kacirma',
          description: 'Yeni urunler ve indirimler icin e-posta listemize katilin.',
        },
        visibility: { desktop: true, mobile: true },
      },
    ];
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
