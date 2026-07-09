/**
 * Bildirim adaptörleri için ortak tip tanımları.
 *
 * Her adaptör (SMTP, Resend, SendGrid, Twilio SMS, Push) bu interface'i
 * imzalar. `NotificationService` adaptör seçimini `NotificationRegistry`
 * üzerinden yapar.
 *
 * Türkiye uyumu:
 *  - E-posta içerikleri UTF-8 ve Türkçe karakter desteği
 *  - KVKK: alıcıya gönderilen e-postalar gönderim loguna kaydedilir
 *  - Unsubscribe header (RFC 8058) opsiyonel
 */

/** E-posta adresi. */
export interface EmailAddress {
  email: string;
  name?: string;
}

/** Ek dosya (attachment). */
export interface EmailAttachment {
  filename: string;
  content: Buffer | string; // Buffer veya base64 string
  /** Base64 mi raw mı? (default: false = raw) */
  base64?: boolean;
  contentType?: string;
}

/** Basit inline görsel (cid:logo.png). */
export interface InlineImage {
  cid: string; // Content-ID
  filename: string;
  content: Buffer;
  contentType: string;
}

/** E-posta gönderim isteği. */
export interface SendEmailRequest {
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  /** Düz metin versiyonu. */
  text?: string;
  /** HTML versiyonu. */
  html?: string;
  attachments?: EmailAttachment[];
  inlineImages?: InlineImage[];
  /** Şablon + değişkenler (Twig/Handlebars). */
  template?: {
    name: string;
    variables: Record<string, unknown>;
  };
  /** KVKK uyumlu gönderim log'u için etiketler. */
  tags?: string[];
  /** Deduplication için idempotency key. */
  idempotencyKey?: string;
  /** Yanıt takibi için. */
  replyToMessageId?: string;
}

/** E-posta gönderim yanıtı. */
export interface SendEmailResult {
  /** Sağlayıcı tarafından atanan mesaj ID. */
  messageId: string;
  /** Sağlayıcı (smtp, resend, sendgrid, ...). */
  provider: string;
  /** Teslim durumu (queued, sent, delivered, bounced, failed). */
  status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed';
  /** Hata varsa. */
  errorMessage?: string;
  /** Sağlayıcı yanıtı (debug/log). */
  rawResponse?: unknown;
}

/** Adaptör kimlik bilgileri. */
export interface AdapterCredentials {
  /** API anahtarı (Resend, SendGrid için). */
  apiKey?: string;
  /** SMTP bilgileri. */
  smtp?: {
    host: string;
    port: number;
    secure?: boolean; // TLS için true (port 465)
    user?: string;
    password?: string;
  };
  /** Varsayılan gönderici. */
  defaultFrom?: EmailAddress;
  /** Test modu (sandbox/canary). */
  testMode?: boolean;
}

/**
 * Bildirim adaptörü sözleşmesi — her sağlayıcı bu interface'i imzalar.
 */
export interface NotificationAdapter {
  /** Adaptör adı ('smtp', 'resend', 'sendgrid', 'twilio'). */
  readonly name: string;
  /** Görüntülenecek ad. */
  readonly displayName: string;
  /** E-posta desteği. */
  readonly supportsEmail: boolean;
  /** SMS desteği. */
  readonly supportsSms: boolean;
  /** Push desteği. */
  readonly supportsPush: boolean;

  /** Adaptörü yapılandır. */
  configure(credentials: AdapterCredentials): void;

  /** E-posta gönder. */
  sendEmail(req: SendEmailRequest): Promise<SendEmailResult>;
}

/**
 * Adaptör kayıt defteri — runtime'da birden fazla adaptör birlikte çalışabilir.
 */
export class NotificationAdapterRegistry {
  private adapters = new Map<string, NotificationAdapter>();

  register(adapter: NotificationAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): NotificationAdapter | undefined {
    return this.adapters.get(name);
  }

  list(): NotificationAdapter[] {
    return Array.from(this.adapters.values());
  }

  has(name: string): boolean {
    return this.adapters.has(name);
  }
}

// ===========================================================================
// Bildirim Tipleri (event-based)
// ===========================================================================

/** Sipariş onayı. */
export interface OrderConfirmationEvent {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  totalAmount: number;
  currency: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  shippingAddress: string;
  estimatedDelivery?: string;
}

/** Sipariş durum değişikliği. */
export interface OrderStatusChangedEvent {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  oldStatus: string;
  newStatus: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

/** B2B bayi onayı. */
export interface DealerApprovedEvent {
  dealerName: string;
  contactEmail: string;
  contactName: string;
  creditLimit?: number;
  paymentTermDays: number;
}

/** KVKK veri ihraç tamamlandı. */
export interface KvkkDataExportReadyEvent {
  customerEmail: string;
  customerName: string;
  downloadUrl: string;
  expiresAt: Date;
}

export interface TenantWelcomeEvent {
  tenantName: string;
  adminFullName: string;
  slug: string;
  subdomain: string;
  verificationUrl: string;
  trialEndsAt: string;
}

/** Bildirim türleri. */
export type NotificationEvent =
  | { type: 'order.confirmation'; data: OrderConfirmationEvent }
  | { type: 'order.status_changed'; data: OrderStatusChangedEvent }
  | { type: 'dealer.approved'; data: DealerApprovedEvent }
  | { type: 'kvkk.data_export_ready'; data: KvkkDataExportReadyEvent }
  | { type: 'tenant.welcome'; data: TenantWelcomeEvent };
