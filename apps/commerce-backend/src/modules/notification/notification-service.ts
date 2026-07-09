/**
 * Notification servisi — sipariş/dealer olayları için e-posta kuyruğa iş ekler.
 *
 * Bu modül doğrudan SMTP/Resend çağırmaz; sadece email kuyruğuna iş ekler.
 * Worker (veya InMemoryQueue) işi alır, şablonu render eder, adapter ile gönderir.
 *
 * @eticart/notification-adapters paketinden import eder.
 */
import { createLogger } from '@eticart/config';
import {
  InMemoryQueue,
  createEmailQueueHandler,
  DEFAULT_ADAPTER_BY_EVENT,
  DEFAULT_TEMPLATE_BY_EVENT,
  NotificationAdapterRegistry,
  SmtpClient,
  ResendClient,
  ORDER_CONFIRMATION_TEMPLATE,
  ORDER_STATUS_CHANGED_TEMPLATE,
  DEALER_APPROVED_TEMPLATE,
  KVKK_DATA_EXPORT_READY_TEMPLATE,
  type EmailQueue,
  type EmailQueueJob,
  type EmailQueueHandler,
  type EmailTemplate,
} from '@eticart/notification-adapters';
import type { OrderStatus } from '@prisma/client';

const log = createLogger({ service: 'notification-service' });

// Adapter kayıt defteri
const registry = new NotificationAdapterRegistry();
const templates = new Map<string, EmailTemplate>();

// Lazy adapter konfigürasyonu (env'den okur)
let configured = false;

function configureFromEnv() {
  if (configured) return;
  configured = true;

  // SMTP her zaman yapılandır (prod'da olmasa bile kuyruk sessizce uyarır)
  if (process.env.SMTP_HOST) {
    const smtp = new SmtpClient();
    smtp.configure({
      smtp: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
        secure: process.env.SMTP_SECURE === 'true',
      },
    });
    registry.register(smtp);
    log.info({ host: process.env.SMTP_HOST }, 'SMTP adaptörü kayıtlı');
  } else {
    log.warn('SMTP_HOST tanımsız — e-posta gönderimi çalışmayacak');
  }

  // Resend (HTTP API, opsiyonel)
  if (process.env.RESEND_API_KEY) {
    const resend = new ResendClient();
    resend.configure({ apiKey: process.env.RESEND_API_KEY });
    registry.register(resend);
    log.info('Resend adaptörü kayıtlı');
  }

  // Şablonlar
  templates.set('order_confirmation', ORDER_CONFIRMATION_TEMPLATE);
  templates.set('order_status_changed', ORDER_STATUS_CHANGED_TEMPLATE);
  templates.set('dealer_approved', DEALER_APPROVED_TEMPLATE);
  templates.set('kvkk_data_export_ready', KVKK_DATA_EXPORT_READY_TEMPLATE);

  // Default 'from' adresi
  NotificationService.defaultFrom = {
    email: process.env.MAIL_FROM ?? 'noreply@eticart.local',
    name: process.env.MAIL_FROM_NAME ?? 'eticart',
  };
}

const handler: EmailQueueHandler = createEmailQueueHandler({
  registry,
  templates,
  defaultFrom: { email: 'noreply@eticart.local', name: 'eticart' },
  adapterByEvent: DEFAULT_ADAPTER_BY_EVENT,
  templateByEvent: DEFAULT_TEMPLATE_BY_EVENT,
});

export const NotificationService = {
  defaultFrom: { email: 'noreply@eticart.local', name: 'eticart' } as { email: string; name?: string },

  /**
   * Sipariş onay e-postası kuyruğa eklenir.
   */
  async enqueueOrderConfirmation(args: {
    tenantId: string;
    orderId: string;
    orderNumber: string;
    customerEmail: string;
    customerName: string;
    total: string;
    currency: string;
    orderUrl?: string;
  }): Promise<void> {
    configureFromEnv();
    const job: EmailQueueJob = {
      jobId: `order-confirmation:${args.orderId}`,
      event: 'order.confirmation',
      templateName: 'order_confirmation',
      adapterName: 'smtp',
      data: {
        orderNumber: args.orderNumber,
        customerName: args.customerName,
        total: args.total,
        currency: args.currency,
        orderUrl: args.orderUrl ?? `${process.env.STOREFRONT_URL ?? 'https://eticart.local'}/orders/${args.orderNumber}`,
        to: { email: args.customerEmail },
      },
    };

    const queue: EmailQueue = NotificationService.queue;
    await queue.enqueue(job);
    log.info({ orderId: args.orderId, customerEmail: args.customerEmail }, 'order.confirmation enqueued');
  },

  /**
   * Sipariş durumu değişti e-postası.
   */
  async enqueueOrderStatusChanged(args: {
    tenantId: string;
    orderId: string;
    orderNumber: string;
    customerEmail: string;
    customerName: string;
    oldStatus: OrderStatus | string;
    newStatus: OrderStatus | string;
    trackingNumber?: string;
    trackingUrl?: string;
  }): Promise<void> {
    configureFromEnv();
    const job: EmailQueueJob = {
      jobId: `order-status:${args.orderId}:${args.newStatus}`,
      event: 'order.status_changed',
      templateName: 'order_status_changed',
      adapterName: 'smtp',
      data: {
        orderNumber: args.orderNumber,
        customerName: args.customerName,
        oldStatus: String(args.oldStatus),
        newStatus: String(args.newStatus),
        trackingNumber: args.trackingNumber ?? '',
        trackingUrl: args.trackingUrl ?? '',
        to: { email: args.customerEmail },
      },
    };

    await NotificationService.queue.enqueue(job);
    log.info({ orderId: args.orderId, newStatus: args.newStatus }, 'order.status_changed enqueued');
  },

  /**
   * Bayi onay e-postası.
   */
  async enqueueDealerApproved(args: {
    tenantId: string;
    dealerEmail: string;
    dealerName: string;
    creditLimit?: string;
    currency?: string;
    loginUrl?: string;
  }): Promise<void> {
    configureFromEnv();
    const job: EmailQueueJob = {
      jobId: `dealer-approved:${args.dealerEmail}`,
      event: 'dealer.approved',
      templateName: 'dealer_approved',
      adapterName: 'smtp',
      data: {
        dealerName: args.dealerName,
        creditLimit: args.creditLimit ?? '',
        currency: args.currency ?? 'TRY',
        loginUrl: args.loginUrl ?? `${process.env.ADMIN_URL ?? 'https://admin.eticart.local'}/login`,
        to: { email: args.dealerEmail },
      },
    };

    await NotificationService.queue.enqueue(job);
    log.info({ dealerEmail: args.dealerEmail }, 'dealer.approved enqueued');
  },

  /**
   * KVKK veri dışa aktarım hazır e-postası.
   */
  async enqueueKvkkDataExportReady(args: {
    tenantId: string;
    customerEmail: string;
    customerName: string;
    downloadUrl: string;
    expiresAt: string;
  }): Promise<void> {
    configureFromEnv();
    const job: EmailQueueJob = {
      jobId: `kvkk-export:${args.customerEmail}:${Date.now()}`,
      event: 'kvkk.data_export_ready',
      templateName: 'kvkk_data_export_ready',
      adapterName: 'smtp',
      data: {
        customerName: args.customerName,
        downloadUrl: args.downloadUrl,
        expiresAt: args.expiresAt,
        to: { email: args.customerEmail },
      },
    };

    await NotificationService.queue.enqueue(job);
    log.info({ customerEmail: args.customerEmail }, 'kvkk.data_export_ready enqueued');
  },

  /**
   * Kuyruk (InMemoryQueue; prod'da BullMQ'ya değiştirilebilir).
   */
  queue: new InMemoryQueue(handler),
};

export default NotificationService;