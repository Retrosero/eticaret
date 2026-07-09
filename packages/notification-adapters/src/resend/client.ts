/**
 * Resend.com e-posta adaptörü.
 *
 * Resend modern bir transactional email API'dir.
 *   - 100 e-posta/gün ücretsiz
 *   - React Email template desteği (HTML oluşturmak için React kullanabilirsiniz)
 *   - Detaylı deliverability metrikleri
 *   - EU region (Frankfurt) desteği
 *
 * Resmi API: https://resend.com/docs/api-reference/emails/send-email
 */
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { createLogger } from '@eticart/config';
import type {
  AdapterCredentials,
  SendEmailRequest,
  SendEmailResult,
  NotificationAdapter,
} from '../common/types.js';

const log = createLogger({ service: 'notification-adapters/resend' });

const RESEND_API_URL = 'https://api.resend.com';

interface ResendApiResponse<T = unknown> {
  id?: string;
  object?: string;
  data?: T;
  /** Hata varsa. */
  statusCode?: number;
  message?: string;
  name?: string;
}

export class ResendClient implements NotificationAdapter {
  readonly name = 'resend';
  readonly displayName = 'Resend.com';
  readonly supportsEmail = true;
  readonly supportsSms = false;
  readonly supportsPush = false;

  private http!: AxiosInstance;
  private credentials: AdapterCredentials | null = null;

  configure(credentials: AdapterCredentials): void {
    this.credentials = credentials;
    if (!credentials.apiKey) {
      throw new Error('Resend API anahtarı eksik. credentials.apiKey gerekli.');
    }

    this.http = axios.create({
      baseURL: RESEND_API_URL,
      timeout: 15_000,
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    log.info({ testMode: credentials.testMode ?? false }, 'Resend adaptörü yapılandırıldı');
  }

  async sendEmail(req: SendEmailRequest): Promise<SendEmailResult> {
    if (!this.http || !this.credentials) {
      throw new Error('Resend adaptörü yapılandırılmamış.');
    }

    try {
      // Resend payload formatı
      const payload: Record<string, unknown> = {
        from: req.from.name
          ? `${req.from.name} <${req.from.email}>`
          : req.from.email,
        to: req.to.map((t) => (t.name ? `${t.name} <${t.email}>` : t.email)),
        subject: req.subject,
        html: req.html,
        text: req.text,
        cc: req.cc?.map((t) => (t.name ? `${t.name} <${t.email}>` : t.email)),
        bcc: req.bcc?.map((t) => (t.name ? `${t.name} <${t.email}>` : t.email)),
        reply_to: req.replyTo
          ? req.replyTo.name
            ? `${req.replyTo.name} <${req.replyTo.email}>`
            : req.replyTo.email
          : undefined,
        attachments: req.attachments?.map((a) => ({
          filename: a.filename,
          content: a.base64
            ? Buffer.from(a.content as string).toString('base64')
            : typeof a.content === 'string'
              ? a.content
              : (a.content as Buffer).toString('base64'),
        })),
        headers: {
          'X-Mailer': 'eticart-notification-adapters',
          ...(req.tags ? { 'X-Tags': req.tags.join(',') } : {}),
        },
        // Idempotency için
        ...(req.idempotencyKey ? { headers: { 'Idempotency-Key': req.idempotencyKey } } : {}),
      };

      const { data } = await this.http.post<ResendApiResponse>('/emails', payload);

      if (!data.id) {
        return {
          messageId: '',
          provider: this.name,
          status: 'failed',
          errorMessage: data.message ?? 'Resend yanıtı başarısız',
          rawResponse: data,
        };
      }

      log.info(
        {
          messageId: data.id,
          to: req.to.map((t) => t.email).join(', '),
          subject: req.subject,
        },
        'Resend: E-posta gönderildi',
      );

      return {
        messageId: data.id,
        provider: this.name,
        status: 'sent',
        rawResponse: data,
      };
    } catch (err: any) {
      log.error({ err: err?.message }, 'Resend: Gönderim hatası');
      return {
        messageId: '',
        provider: this.name,
        status: 'failed',
        errorMessage:
          err?.response?.data?.message ?? err?.message ?? 'Bilinmeyen Resend hatası',
        rawResponse: err?.response?.data,
      };
    }
  }
}