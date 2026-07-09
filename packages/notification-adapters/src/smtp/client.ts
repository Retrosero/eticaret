/**
 * SMTP (Nodemailer) e-posta adaptörü.
 *
 * Genel SMTP sağlayıcılarını destekler:
 *   - Gmail, Outlook, Yandex
 *   - SendGrid, Mailgun, Brevo, Postmark (SMTP modunda)
 *   - Yerel Postfix/Exim
 *
 * Avantaj: Herhangi bir SMTP sunucusu ile çalışır.
 * Dezavantaj: API tabanlı sağlayıcılardan (Resend, SES) daha yavaş.
 */
import { createLogger } from '@eticart/config';
import type {
  AdapterCredentials,
  SendEmailRequest,
  SendEmailResult,
  NotificationAdapter,
} from '../common/types.js';

const log = createLogger({ service: 'notification-adapters/smtp' });

// Nodemailer dynamic import — opsiyonel bağımlılık (production'da yüklü)
type NodemailerModule = {
  createTransport: (config: any) => any;
  getTestMessageUrl?: (info: any) => string | null;
};

let nodemailerCache: NodemailerModule | null = null;

async function loadNodemailer(): Promise<NodemailerModule> {
  if (nodemailerCache) return nodemailerCache;
  try {
    const mod = await import('nodemailer' as string);
    nodemailerCache = (mod as any).default ?? (mod as any);
    return nodemailerCache!;
  } catch (err) {
    throw new Error(
      'nodemailer paketi yüklü değil. `pnpm add nodemailer` ile ekleyin.',
    );
  }
}

export class SmtpClient implements NotificationAdapter {
  readonly name = 'smtp';
  readonly displayName = 'SMTP (Nodemailer)';
  readonly supportsEmail = true;
  readonly supportsSms = false;
  readonly supportsPush = false;

  private transport: any = null;
  private credentials: AdapterCredentials | null = null;

  configure(credentials: AdapterCredentials): void {
    this.credentials = credentials;
    if (!credentials.smtp) {
      throw new Error('SMTP yapılandırması eksik. credentials.smtp gerekli.');
    }
    log.info(
      {
        host: credentials.smtp.host,
        port: credentials.smtp.port,
        secure: credentials.smtp.secure ?? false,
      },
      'SMTP adaptörü yapılandırıldı',
    );
  }

  /**
   * Async transporter oluştur (lazy initialization).
   * SMTP credentials her çağrıda kontrol edilir.
   */
  private async getTransport(): Promise<any> {
    if (this.transport) return this.transport;
    if (!this.credentials?.smtp) {
      throw new Error('SMTP yapılandırılmamış.');
    }

    const nodemailer = await loadNodemailer();
    const { host, port, secure, user, password } = this.credentials.smtp;

    this.transport = nodemailer.createTransport({
      host,
      port,
      secure: secure ?? port === 465,
      auth: user && password ? { user, pass: password } : undefined,
      // Production'da TLS doğrulama aktif
      tls: { rejectUnauthorized: true },
      // Bağlantı zaman aşımı
      connectionTimeout: 10_000,
    });

    return this.transport;
  }

  async sendEmail(req: SendEmailRequest): Promise<SendEmailResult> {
    try {
      const transport = await this.getTransport();

      // Düz metin versiyonu yoksa HTML'den üret
      const text = req.text ?? stripHtml(req.html ?? '');

      const info = await transport.sendMail({
        from: req.from.name
          ? `"${req.from.name}" <${req.from.email}>`
          : req.from.email,
        to: req.to.map((t) => (t.name ? `"${t.name}" <${t.email}>` : t.email)),
        cc: req.cc?.map((t) => (t.name ? `"${t.name}" <${t.email}>` : t.email)),
        bcc: req.bcc?.map((t) => (t.name ? `"${t.name}" <${t.email}>` : t.email)),
        replyTo: req.replyTo
          ? req.replyTo.name
            ? `"${req.replyTo.name}" <${req.replyTo.email}>`
            : req.replyTo.email
          : undefined,
        subject: req.subject,
        text,
        html: req.html,
        attachments: req.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          encoding: a.base64 ? 'base64' : undefined,
          contentType: a.contentType,
        })),
        // Inline görseller (logo gibi)
        ...(req.inlineImages && req.inlineImages.length > 0
          ? {
              attachments: [
                ...(req.attachments ?? []).map((a) => ({
                  filename: a.filename,
                  content: a.content,
                  encoding: a.base64 ? 'base64' : undefined,
                  contentType: a.contentType,
                })),
                ...req.inlineImages.map((img) => ({
                  filename: img.filename,
                  content: img.content,
                  cid: img.cid,
                  contentType: img.contentType,
                })),
              ],
            }
          : {}),
        // KVKK uyumlu başlık
        headers: {
          'X-Mailer': 'eticart-notification-adapters',
          ...(req.tags ? { 'X-Tags': req.tags.join(',') } : {}),
        },
        // Idempotency
        ...(req.idempotencyKey ? { messageId: req.idempotencyKey } : {}),
      });

      log.info(
        {
          messageId: info.messageId,
          to: req.to.map((t) => t.email).join(', '),
          subject: req.subject,
        },
        'SMTP: E-posta gönderildi',
      );

      return {
        messageId: info.messageId ?? '',
        provider: this.name,
        status: 'sent',
        rawResponse: { accepted: info.accepted, rejected: info.rejected },
      };
    } catch (err: any) {
      log.error({ err: err?.message }, 'SMTP: Gönderim hatası');
      return {
        messageId: '',
        provider: this.name,
        status: 'failed',
        errorMessage: err?.message ?? 'Bilinmeyen SMTP hatası',
        rawResponse: err,
      };
    }
  }
}

/** HTML'den basit düz metin çıkar. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}