/**
 * E-posta kuyruk entegrasyonu (BullMQ).
 *
 * Yüksek hacimli e-posta gönderiminde ana thread'i bloklamamak için
 * BullMQ kuyruğu kullanılır. Aşağıdaki iş akışı:
 *
 *   - Sipariş oluştur → publish 'order.confirmation'
 *   - Sipariş durum değişti → publish 'order.status_changed'
 *   - Bayi onaylandı → publish 'dealer.approved'
 *
 *   Worker (ayrı process):
 *     - Adapter'dan template'i alır, render eder
 *     - Adapter ile gönderir
 *     - Hata olursa exponential backoff (3 retry)
 *
 * BullMQ olmadan test ortamında InMemoryQueue kullanılır.
 */
import { createLogger } from '@eticart/config';
import type {
  NotificationAdapterRegistry,
  NotificationEvent,
} from '../common/index.js';
import { renderEmailTemplate } from '../common/template.js';

const log = createLogger({ service: 'notification-adapters/queue' });

/** Kuyruk işi. */
export interface EmailQueueJob {
  /** Benzersiz job ID (idempotency için). */
  jobId: string;
  /** Bildirim event tipi. */
  event: NotificationEvent['type'];
  /** Event verisi (template için değişkenler). */
  data: Record<string, unknown>;
  /** Şablon adı (event → template mapping). */
  templateName: string;
  /** Kullanılacak adapter adı. */
  adapterName: string;
}

export interface EmailQueue {
  /** Kuyruğa iş ekle. */
  enqueue(job: EmailQueueJob): Promise<void>;
  /** İşi çalıştır (worker main loop). */
  process(): Promise<void>;
  /** Worker'ı durdur. */
  close(): Promise<void>;
  /** Kuyruktaki iş sayısı (test için). */
  size(): number;
}

/**
 * InMemoryQueue — test/dev ortamı için basit kuyruk.
 *
 * Prod'da BullQueue kullanılmalı (BullMQ).
 */
export class InMemoryQueue implements EmailQueue {
  private readonly jobs: EmailQueueJob[] = [];
  private running = false;
  private readonly handle: EmailQueueHandler;

  constructor(handler: EmailQueueHandler) {
    this.handle = handler;
  }

  async enqueue(job: EmailQueueJob): Promise<void> {
    this.jobs.push(job);
    log.debug({ jobId: job.jobId, event: job.event }, 'Kuyruğa iş eklendi');

    // Arka planda işle (basit yaklaşım)
    if (!this.running) {
      this.running = true;
      setImmediate(() => this.process().catch((e) => log.error({ err: e.message }, 'queue error')));
    }
  }

  async process(): Promise<void> {
    while (this.jobs.length > 0) {
      const job = this.jobs.shift()!;
      await this.handle(job);
    }
    this.running = false;
  }

  async close(): Promise<void> {
    this.jobs.length = 0;
    this.running = false;
  }

  size(): number {
    return this.jobs.length;
  }
}

/**
 * BullMQ implementasyonu (stub — prod'da gerçek BullMQ import edilir).
 *
 * Gerçek implementasyon:
 *   import { Queue, Worker, QueueEvents } from 'bullmq';
 *   ...
 *   const q = new Queue('email', { connection: redisOpts });
 *   const worker = new Worker('email', async (job) => {...}, { connection: redisOpts });
 */
export interface EmailQueueHandlerOptions {
  registry: NotificationAdapterRegistry;
  templates: Map<string, any>; // EmailTemplate
  /** Event → adapter adı mapping. */
  adapterByEvent?: Record<string, string>;
  /** Şablon adı → template mapping. */
  templateByEvent?: Record<string, string>;
  /** Şablon için kullanılacak 'from' adresi. */
  defaultFrom: { email: string; name?: string };
  /** Retry sayısı. */
  maxRetries?: number;
  /** Alıcı resolver: event verisinden email adresi üretir. */
  resolveRecipient?: (event: NotificationEvent) => Promise<{
    email: string;
    name?: string;
  } | null>;
}

export type EmailQueueHandler = (job: EmailQueueJob) => Promise<void>;

export function createEmailQueueHandler(
  opts: EmailQueueHandlerOptions
): EmailQueueHandler {
  const {
    registry,
    templates,
    adapterByEvent = {},
    templateByEvent = {},
    defaultFrom,
    maxRetries = 3,
    resolveRecipient,
  } = opts;

  return async function handle(job: EmailQueueJob): Promise<void> {
    const adapter = registry.get(adapterByEvent[job.event] ?? job.adapterName);
    if (!adapter || !adapter.supportsEmail) {
      log.warn({ event: job.event, adapter: job.adapterName }, 'Adapter bulunamadı veya email desteklemiyor');
      return;
    }

    const tplName = templateByEvent[job.event] ?? job.templateName;
    const tpl = templates.get(tplName);
    if (!tpl) {
      log.warn({ event: job.event, tplName }, 'Şablon bulunamadı');
      return;
    }

    // Render et
    let rendered;
    try {
      rendered = renderEmailTemplate(tpl, job.data);
    } catch (err: any) {
      log.error({ err: err?.message, event: job.event }, 'Şablon render hatası');
      throw err;
    }

    // Alıcı belirle
    let recipient: { email: string; name?: string } | null = null;
    if (resolveRecipient) {
      recipient = await resolveRecipient(job.data as NotificationEvent);
    } else {
      // data.to varsa kullan
      const dataAny = job.data as any;
      if (dataAny.to?.email) recipient = dataAny.to;
      else if (dataAny.customerEmail) recipient = { email: dataAny.customerEmail };
    }

    if (!recipient) {
      log.warn({ event: job.event }, 'Alıcı belirlenemedi');
      return;
    }

    // Retry ile gönder
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await adapter.sendEmail({
          from: defaultFrom,
          to: [recipient],
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          tags: [job.event, `job:${job.jobId}`],
          idempotencyKey: job.jobId,
        });

        if (result.status === 'sent') {
          log.info(
            { jobId: job.jobId, messageId: result.messageId, attempt },
            'E-posta kuyruktan gönderildi',
          );
          return;
        }

        lastError = result.errorMessage;
        log.warn(
          { jobId: job.jobId, attempt, error: lastError },
          'Gönderim başarısız, retry',
        );
      } catch (err: any) {
        lastError = err?.message ?? 'Bilinmeyen hata';
        log.error({ err: lastError, jobId: job.jobId, attempt }, 'Adapter hatası');
      }

      // Exponential backoff
      if (attempt < maxRetries) {
        const delay = 1000 * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    log.error(
      { jobId: job.jobId, maxRetries, lastError },
      'E-posta gönderimi tüm retry\'lerde başarısız',
    );
    // Prod'da: dead-letter queue'ya at
  };
}

/**
 * Varsayılan event → adapter/template mapping.
 *
 * Tüm event'ler SMTP veya Resend'e gidebilir.
 */
export const DEFAULT_ADAPTER_BY_EVENT: Record<string, string> = {
  'order.confirmation': 'smtp',
  'order.status_changed': 'smtp',
  'dealer.approved': 'smtp',
  'kvkk.data_export_ready': 'smtp',
};

export const DEFAULT_TEMPLATE_BY_EVENT: Record<string, string> = {
  'order.confirmation': 'order_confirmation',
  'order.status_changed': 'order_status_changed',
  'dealer.approved': 'dealer_approved',
  'kvkk.data_export_ready': 'kvkk_data_export_ready',
};