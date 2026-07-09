/**
 * Audit log servisi.
 *
 * Tüm süper admin işlemleri için ortak loglama noktası. Hem
 * uygulama içinden (`TenantsService.archive` gibi) hem de
 * controller'lardan çağrılabilir.
 *
 * Audit log tablosu append-only'dir; kayıtlar **asla**
 * güncellenmez veya silinmez (KVKK ve adli tutulabilirlik için).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Uuid } from '@eticart/shared-types';
import type { Logger } from '@eticart/config';

import { LOGGER_TOKEN } from '../common/logger.js';
import { maskMail, maskIp } from '../shared/masking.js';

export interface AuditLogInput {
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actorId: Uuid | null;
  actorEmail: string | null;
  actorType?: 'super_admin' | 'tenant_admin' | 'system' | 'api';
  tenantId?: Uuid | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
  ) {}

  /**
   * Audit log satırı yaz. Hata durumunda hata yutulmaz; audit
   * log başarısız olursa çağıran işlem de başarısız olur (KVKK).
   */
  async log(input: AuditLogInput): Promise<void> {
    const actorEmailMasked = input.actorEmail ? maskMail(input.actorEmail) : null;
    const ipMasked = maskIp(input.ip ?? null);

    try {
      await this.pool.query(
        `INSERT INTO public.audit_logs (
            actor_id, actor_email_masked, actor_type, tenant_id,
            action, resource_type, resource_id,
            before_state, after_state,
            ip_masked, user_agent, request_id, correlation_id,
            success, metadata
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8::jsonb, $9::jsonb,
            $10, $11, $12, $13,
            $14, $15::jsonb
          )`,
        [
          input.actorId,
          actorEmailMasked,
          input.actorType ?? 'super_admin',
          input.tenantId ?? null,
          input.action,
          input.resourceType,
          input.resourceId,
          input.before ? JSON.stringify(input.before) : null,
          input.after ? JSON.stringify(input.after) : null,
          ipMasked,
          input.userAgent ?? null,
          input.requestId ?? null,
          input.correlationId ?? null,
          input.success ?? true,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
    } catch (err) {
      this.logger.error(
        { err, action: input.action, resourceId: input.resourceId },
        'Audit log yazılamadı',
      );
      throw err;
    }
  }
}