/**
 * Audit log servisi — güvenlik olaylarını kayıt eder.
 *
 * Loglanan olaylar:
 *   - login (başarılı/başarısız)
 *   - token doğrulama hataları
 *   - CSRF ihlali
 *   - Rate limit aşımı
 *   - Cross-tenant erişim girişimi
 *   - Yetkisiz admin işlemi
 *   - Veri silme (KVKK)
 *   - Fatura oluşturma / iptal
 *
 * Üretimde bu servis Sentry / Datadog / CloudWatch'a bağlanabilir;
 * aynı zamanda yerel bir logger.info + audit_logs tablosuna yazar
 * (ileride Prisma model eklendiğinde).
 */
import { createLogger } from '@eticart/config';
import { randomUUID } from 'node:crypto';

const log = createLogger({ service: 'audit' });

export type AuditAction =
  // Auth
  | 'login.success'
  | 'login.failure'
  | 'token.invalid'
  | 'token.expired'
  | 'token.reuse_detected'
  | 'logout'
  // CSRF
  | 'csrf.missing'
  | 'csrf.mismatch'
  | 'csrf.invalid'
  // Rate limit
  | 'rate_limit.exceeded'
  // Tenant
  | 'tenant.cross_tenant_attempt'
  | 'tenant.unauthorized'
  // Admin actions
  | 'admin.user_created'
  | 'admin.user_deleted'
  | 'admin.role_changed'
  | 'admin.settings_changed'
  // Veri
  | 'data.export_requested'
  | 'data.export_downloaded'
  | 'data.delete_requested' // KVKK
  | 'data.delete_completed'
  // Fatura
  | 'invoice.created'
  | 'invoice.cancelled'
  | 'invoice.sent_to_gib'
  // Sipariş
  | 'order.status_changed'
  | 'order.cancelled'
  // B2B
  | 'dealer.approved'
  | 'dealer.rejected'
  | 'credit_limit.changed';

export type AuditSeverity = 'info' | 'warning' | 'critical';

/** DB'ye yazılacak audit log input (Prisma ile uyumlu). */
export interface AuditLogInput {
  id?: string;
  tenantId?: string | null;
  userId?: string | null;
  customerId?: string | null;
  action: string;
  severity: string;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  path?: string | null;
  method?: string | null;
  context?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface AuditEvent {
  /** Benzersiz event ID. */
  id: string;
  /** Aksiyon tipi. */
  action: AuditAction;
  /** Tenant ID (varsa). */
  tenantId?: string;
  /** Kullanıcı ID (varsa). */
  userId?: string;
  /** Müşteri ID (varsa). */
  customerId?: string;
  /** IP adresi. */
  ip?: string;
  /** User agent. */
  userAgent?: string;
  /** Correlation ID (request tracing). */
  correlationId?: string;
  /** Ek bağlam. */
  context?: Record<string, unknown>;
  /** Severity seviyesi. */
  severity: AuditSeverity;
  /** Olay zamanı (ms epoch). */
  timestamp: number;
}

class AuditService {
  private inMemoryBuffer: AuditEvent[] = [];
  private maxBuffer = 500;
  private dbWriter: ((event: AuditLogInput) => Promise<void>) | null = null;
  private dbEnabled: boolean = process.env['AUDIT_DB_ENABLED'] === 'true';

  /** Olayı logla. */
  record(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
    const full: AuditEvent = {
      ...event,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    // Severity'ye göre logla (test ortamında logger override edilmiş olabilir)
    try {
      const logFn =
        full.severity === 'critical'
          ? log.error
          : full.severity === 'warning'
            ? log.warn
            : log.info;

      logFn(
        {
          eventId: full.id,
          action: full.action,
          tenantId: full.tenantId,
          userId: full.userId,
          ip: full.ip,
          correlationId: full.correlationId,
          context: full.context,
        },
        `AUDIT ${full.action}`,
      );
    } catch {
      // Logger unavailable — in-memory buffer'a yaz, devam et
    }

    // In-memory buffer (son N olay)
    this.inMemoryBuffer.push(full);
    if (this.inMemoryBuffer.length > this.maxBuffer) {
      this.inMemoryBuffer.shift();
    }

    // DB'ye yaz (fire-and-forget; hata olursa logla ama engelleme)
    if (this.dbEnabled) {
      this.writeToDb(full).catch((err) => {
        try {
          log.error({ err: err?.message, eventId: full.id }, 'audit_logs DB yazımı başarısız');
        } catch {}
      });
    }

    // Critical severity → webhook alert tetikle (fire-and-forget)
    if (full.severity === 'critical') {
      import('./alert.service.js')
        .then(({ alertService }) => alertService.alertFromAudit(full))
        .catch((err) => {
          try {
            log.error({ err: err?.message }, 'Alert tetikleme hatası');
          } catch {}
        });
    }

    return full;
  }

  /**
   * DB'ye audit kaydı yaz. Fire-and-forget (caller await etmez).
   *
   * AUDIT_DB_ENABLED env true ise aktif.
   * Prisma client runtime injection ile (DI container'dan alınır).
   */
  private async writeToDb(event: AuditEvent): Promise<void> {
    if (!this.dbWriter) return;

    try {
      await this.dbWriter({
        id: event.id,
        tenantId: event.tenantId ?? null,
        userId: event.userId ?? null,
        customerId: event.customerId ?? null,
        action: event.action,
        severity: event.severity,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
        correlationId: event.correlationId ?? null,
        path: (event.context as any)?.path ?? null,
        method: (event.context as any)?.method ?? null,
        context: (event.context as any) ?? undefined,
        occurredAt: new Date(event.timestamp),
      });
    } catch (err) {
      // Sessizce yut; caller zaten logladı
      throw err;
    }
  }

  /**
   * DB writer'ı ayarla. NestJS module tarafından çağrılır.
   *
   * @example
   *   auditService.setDbWriter(async (event) => {
   *     await prisma.auditLog.create({ data: event });
   *   });
   */
  setDbWriter(writer: (event: AuditLogInput) => Promise<void>): void {
    this.dbWriter = writer;
    this.dbEnabled = !!writer;
    log.info({ dbEnabled: this.dbEnabled }, 'AuditService DB writer ayarlandı');
  }

  /** DB write aktif mi? */
  isDbEnabled(): boolean {
    return this.dbEnabled;
  }

  /** Son olayları getir (debug/dashboard için). */
  recent(limit = 50): ReadonlyArray<AuditEvent> {
    return this.inMemoryBuffer.slice(-limit);
  }

  /** Tenant'a göre filtrele. */
  forTenant(tenantId: string, limit = 50): ReadonlyArray<AuditEvent> {
    return this.inMemoryBuffer.filter((e) => e.tenantId === tenantId).slice(-limit);
  }

  /** User'a göre filtrele. */
  forUser(userId: string, limit = 50): ReadonlyArray<AuditEvent> {
    return this.inMemoryBuffer.filter((e) => e.userId === userId).slice(-limit);
  }

  /** Buffer temizle (test için). */
  clear(): void {
    this.inMemoryBuffer = [];
  }
}

/** Singleton audit servisi. */
export const auditService = new AuditService();

/** Convenience helpers. */
export const Audit = {
  record: (e: Omit<AuditEvent, 'id' | 'timestamp'>) => auditService.record(e),

  /** Auth başarılı. */
  loginSuccess: (params: {
    userId: string;
    tenantId: string;
    ip?: string;
    userAgent?: string;
    correlationId?: string;
  }) =>
    auditService.record({
      action: 'login.success',
      severity: 'info',
      ...params,
    }),

  /** Auth başarısız. */
  loginFailure: (params: { email: string; reason: string; ip?: string }) =>
    auditService.record({
      action: 'login.failure',
      severity: 'warning',
      context: { email: params.email, reason: params.reason },
      ip: params.ip,
    }),

  /** CSRF ihlali. */
  csrfViolation: (params: { reason: string; ip?: string; path: string }) =>
    auditService.record({
      action: 'csrf.mismatch',
      severity: 'warning',
      context: { reason: params.reason, path: params.path },
      ip: params.ip,
    }),

  /** Rate limit aşımı. */
  rateLimitExceeded: (params: { ip?: string; path: string; limit: number }) =>
    auditService.record({
      action: 'rate_limit.exceeded',
      severity: 'warning',
      context: params,
      ip: params.ip,
    }),

  /** Cross-tenant erişim girişimi. */
  crossTenantAttempt: (params: {
    userId: string;
    userTenantId: string;
    targetTenantId: string;
    resource: string;
    ip?: string;
  }) =>
    auditService.record({
      action: 'tenant.cross_tenant_attempt',
      severity: 'critical',
      ...params,
    }),

  /** KVKK veri silme. */
  dataDelete: (params: {
    customerId: string;
    tenantId: string;
    requestId: string;
    userId?: string;
  }) =>
    auditService.record({
      action: 'data.delete_completed',
      severity: 'critical',
      ...params,
    }),

  /** Admin aksiyonu. */
  adminAction: (params: {
    action: AuditAction;
    userId: string;
    tenantId: string;
    target?: string;
    context?: Record<string, unknown>;
    ip?: string;
  }) =>
    auditService.record({
      severity: 'info',
      ...params,
    }),
};

export default auditService;