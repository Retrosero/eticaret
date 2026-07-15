/**
 * Onboarding Repository — Tenant signup-specific DB işlemleri.
 *
 * Ana tenants tablosunu kullanır + ek kolonlar (verification_token,
 * email_verified_at) ve tenant_users tablosu.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { type Logger } from '@eticart/config';
import { PG_POOL_TOKEN } from '../database/database.module.js';
import { LOGGER_TOKEN } from '../common/logger.js';

@Injectable()
export class OnboardingRepository {
  constructor(
    @Inject(PG_POOL_TOKEN) private readonly pool: Pool,
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
  ) {}

  /**
   * Slug ile tenant bul.
   */
  async findBySlug(slug: string): Promise<{
    id: string;
    slug: string;
    status: string;
    updatedAt: Date;
  } | null> {
    const res = await this.pool.query(
      `SELECT id, slug, status, updated_at FROM public.tenants WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    if (!res.rows[0]) return null;
    return {
      id: res.rows[0].id,
      slug: res.rows[0].slug,
      status: res.rows[0].status,
      updatedAt: res.rows[0].updated_at,
    };
  }

  /**
   * Verification token kaydet (hash'li).
   */
  async setVerificationToken(tenantId: string, tokenHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.tenants SET verification_token = $2, updated_at = now() WHERE id = $1`,
      [tenantId, tokenHash],
    );
  }

  /**
   * Verification token ile tenant bul.
   */
  async findByVerificationToken(tokenHash: string): Promise<{
    id: string;
    slug: string;
    status: string;
  } | null> {
    const res = await this.pool.query(
      `SELECT id, slug, status FROM public.tenants WHERE verification_token = $1 LIMIT 1`,
      [tokenHash],
    );
    if (!res.rows[0]) return null;
    return {
      id: res.rows[0].id,
      slug: res.rows[0].slug,
      status: res.rows[0].status,
    };
  }

  /**
   * Verification token temizle.
   */
  async clearVerificationToken(tenantId: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.tenants SET verification_token = NULL WHERE id = $1`,
      [tenantId],
    );
  }

  /**
   * Email verified timestamp set.
   */
  async markEmailVerified(tenantId: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.tenants SET email_verified_at = now(), updated_at = now() WHERE id = $1`,
      [tenantId],
    );
  }


  /**
   * Tenant status güncelle.
   */
  async updateStatus(tenantId: string, status: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.tenants SET status = $2, updated_at = now() WHERE id = $1`,
      [tenantId, status],
    );
  }

  /**
   * Tenant user fetch (email ile).
   */
  async findTenantUserByEmail(email: string): Promise<{
    id: string;
    tenantId: string;
    role: string;
  } | null> {
    await this.ensureTenantUserSchema();
    const res = await this.pool.query(
      `SELECT id, tenant_id, role FROM public.tenant_users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
    );
    if (!res.rows[0]) return null;
    return {
      id: res.rows[0].id,
      tenantId: res.rows[0].tenant_id,
      role: res.rows[0].role,
    };
  }

  /**
   * Tenant ilk admin user oluştur.
   */
  async createTenantUser(input: {
    tenantId: string;
    email: string;
    fullName: string;
    passwordHash: string;
    role: string;
  }): Promise<string> {
    await this.ensureTenantUserSchema();
    const res = await this.pool.query(
      `INSERT INTO public.tenant_users (tenant_id, email, full_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', now(), now())
       RETURNING id`,
      [
        input.tenantId,
        input.email,
        input.fullName,
        input.passwordHash,
        input.role,
      ],
    );
    return res.rows[0]?.id;
  }

  private async ensureTenantUserSchema(): Promise<void> {
    await this.pool.query(
      `ALTER TABLE public.tenant_users
       ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'`,
    );
  }
}
