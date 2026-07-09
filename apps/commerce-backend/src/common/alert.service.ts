/**
 * Alert servisi — kritik audit olayları için webhook bildirimi.
 *
 * Çoklu sağlayıcı desteği:
 *   - Sentry: `SENTRY_WEBHOOK_URL` env ile
 *   - Datadog: `DATADOG_API_KEY` + `DATADOG_APP_KEY` env ile
 *   - Slack: `SLACK_WEBHOOK_URL` env ile
 *   - Generic webhook: `ALERT_WEBHOOK_URL` env ile (POST JSON)
 *
 * `critical` severity olaylar otomatik tetiklenir.
 * Rate-limit: dakikada max 10 alert (alert storm önleme).
 */
import { createLogger } from '@eticart/config';
import { randomUUID } from 'node:crypto';
import type { AuditEvent } from './audit.service.js';

const log = createLogger({ service: 'alert-service' });

export type AlertProvider = 'sentry' | 'datadog' | 'slack' | 'generic';

export interface AlertMessage {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  tags?: Record<string, string>;
  /** Audit event referansı. */
  event?: AuditEvent;
  /** Gönderilme zamanı. */
  sentAt?: number;
}

interface AlertSink {
  provider: AlertProvider;
  enabled: boolean;
  send: (msg: AlertMessage) => Promise<void>;
}

class AlertService {
  private sinks: AlertSink[] = [];
  private recentAlerts: AlertMessage[] = [];
  private maxBuffer = 100;

  /** Dakikada max alert sayısı (alert storm önleme). */
  private rateWindow = 60_000;
  private maxPerWindow = 10;
  private sentInWindow: number[] = [];

  /**
   * Sentry webhook sink'i (Sentry Inbound Webhooks).
   *
   *   https://docs.sentry.io/api/inbox-webhooks/
   */
  enableSentry(webhookUrl: string): void {
    this.sinks.push({
      provider: 'sentry',
      enabled: true,
      send: async (msg) => {
        const payload = {
          action: msg.event?.action ?? 'manual',
          actor: {
            type: 'user',
            id: msg.event?.userId ?? 'system',
          },
          data: {
            title: msg.title,
            body: msg.body,
            severity: msg.severity,
          },
        };
        await this.httpPost(webhookUrl, payload);
      },
    });
    log.info('Sentry alert sink aktif');
  }

  /**
   * Datadog Events API.
   *
   *   https://docs.datadoghq.com/api/latest/events/
   */
  enableDatadog(apiKey: string, appKey?: string): void {
    this.sinks.push({
      provider: 'datadog',
      enabled: true,
      send: async (msg) => {
        // Datadog Events API v2 — direkt HTTP POST
        const url = 'https://api.datadoghq.com/api/v1/events';
        const params = new URLSearchParams({
          api_key: apiKey,
        });
        if (appKey) params.append('app_key', appKey);

        const payload = {
          title: msg.title,
          text: msg.body,
          alert_type: msg.severity === 'critical' ? 'error' : msg.severity === 'warning' ? 'warning' : 'info',
          tags: Object.entries(msg.tags ?? {}).map(([k, v]) => `${k}:${v}`),
          source_type_name: 'eticart',
        };

        await this.httpPost(`${url}?${params.toString()}`, payload);
      },
    });
    log.info('Datadog alert sink aktif');
  }

  /**
   * Slack incoming webhook.
   *
   *   https://api.slack.com/messaging/webhooks
   */
  enableSlack(webhookUrl: string): void {
    this.sinks.push({
      provider: 'slack',
      enabled: true,
      send: async (msg) => {
        const color =
          msg.severity === 'critical' ? 'danger' :
          msg.severity === 'warning' ? 'warning' : 'good';

        const payload = {
          attachments: [
            {
              color,
              title: msg.title,
              text: msg.body,
              fields: msg.event
                ? [
                    { title: 'Action', value: msg.event.action, short: true },
                    { title: 'Tenant', value: msg.event.tenantId ?? '-', short: true },
                    { title: 'IP', value: msg.event.ip ?? '-', short: true },
                  ]
                : [],
            },
          ],
        };
        await this.httpPost(webhookUrl, payload);
      },
    });
    log.info('Slack alert sink aktif');
  }

  /**
   * Generic webhook (custom alerting sistemi).
   */
  enableGeneric(webhookUrl: string): void {
    this.sinks.push({
      provider: 'generic',
      enabled: true,
      send: async (msg) => {
        await this.httpPost(webhookUrl, msg);
      },
    });
    log.info('Generic webhook alert sink aktif');
  }

  /**
   * Env'den otomatik sink konfigürasyonu.
   * NestJS onModuleInit'te çağrılır.
   */
  configureFromEnv(): void {
    if (process.env['SENTRY_WEBHOOK_URL']) {
      this.enableSentry(process.env['SENTRY_WEBHOOK_URL']);
    }
    if (process.env['DATADOG_API_KEY']) {
      this.enableDatadog(
        process.env['DATADOG_API_KEY'],
        process.env['DATADOG_APP_KEY'],
      );
    }
    if (process.env['SLACK_WEBHOOK_URL']) {
      this.enableSlack(process.env['SLACK_WEBHOOK_URL']);
    }
    if (process.env['ALERT_WEBHOOK_URL']) {
      this.enableGeneric(process.env['ALERT_WEBHOOK_URL']);
    }
  }

  /**
   * Audit event'ten otomatik alert gönder (severity 'critical' ise).
   */
  async alertFromAudit(event: AuditEvent): Promise<void> {
    if (event.severity !== 'critical') return;

    await this.send({
      title: `Critical: ${event.action}`,
      body: this.formatBody(event),
      severity: 'critical',
      event,
      tags: {
        action: event.action,
        tenantId: event.tenantId ?? 'platform',
      },
    });
  }

  /**
   * Manuel alert gönder.
   */
  async send(message: Omit<AlertMessage, 'id' | 'sentAt'>): Promise<void> {
    const full: AlertMessage = {
      ...message,
      id: randomUUID(),
      sentAt: Date.now(),
    };

    // Rate limit kontrolü
    if (this.isRateLimited()) {
      log.warn({ messageId: full.id, action: full.event?.action }, 'Alert rate limited');
      this.recentAlerts.push({ ...full, body: full.body + ' [RATE LIMITED]' });
      return;
    }
    this.sentInWindow.push(full.sentAt ?? Date.now());

    // Buffer'a ekle
    this.recentAlerts.push(full);
    if (this.recentAlerts.length > this.maxBuffer) {
      this.recentAlerts.shift();
    }

    // Tüm sink'lere gönder (paralel)
    const promises = this.sinks.map(async (sink) => {
      try {
        await sink.send(full);
        log.info(
          { messageId: full.id, provider: sink.provider, action: full.event?.action },
          'Alert gönderildi',
        );
      } catch (err) {
        log.error(
          { err: (err as Error).message, provider: sink.provider, messageId: full.id },
          'Alert gönderimi başarısız',
        );
      }
    });
    await Promise.allSettled(promises);
  }

  /** Son alert'leri getir. */
  recent(limit = 50): ReadonlyArray<AlertMessage> {
    return this.recentAlerts.slice(-limit);
  }

  /** Aktif sink'ler. */
  providers(): AlertProvider[] {
    return this.sinks.map((s) => s.provider);
  }

  /** Test/cleanup için. */
  reset(): void {
    this.sinks = [];
    this.recentAlerts = [];
    this.sentInWindow = [];
  }

  // Private

  private isRateLimited(): boolean {
    const now = Date.now();
    this.sentInWindow = this.sentInWindow.filter((t) => now - t < this.rateWindow);
    return this.sentInWindow.length >= this.maxPerWindow;
  }

  private formatBody(event: AuditEvent): string {
    const parts = [
      `Action: ${event.action}`,
      event.tenantId ? `Tenant: ${event.tenantId}` : null,
      event.userId ? `User: ${event.userId}` : null,
      event.ip ? `IP: ${event.ip}` : null,
      event.context ? `Context: ${JSON.stringify(event.context)}` : null,
    ].filter(Boolean);
    return parts.join('\n');
  }

  private async httpPost(url: string, body: unknown): Promise<void> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000), // 5s timeout
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }
  }
}

/** Singleton alert servisi. */
export const alertService = new AlertService();

/** Convenience helpers. */
export const Alert = {
  fromAudit: (event: AuditEvent) => alertService.alertFromAudit(event),
  send: (msg: Omit<AlertMessage, 'id' | 'sentAt'>) => alertService.send(msg),
  providers: () => alertService.providers(),
};

export default alertService;