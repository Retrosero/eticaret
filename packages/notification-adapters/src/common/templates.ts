/**
 * E-posta şablonları — Türkçe, KVKK uyumlu.
 *
 * Şablonlar tüm tenant'lar için ortak — Faz 11'de tenant başına override
 * eklenebilir.
 */

import type { RenderedEmail } from './template.js';
import { renderEmailTemplate } from './template.js';

// ===========================================================================
// Base Layout
// ===========================================================================

const BASE_LAYOUT = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #1e40af; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .content { padding: 32px 24px; }
    .button { display: inline-block; background: #1e40af; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 16px 0; }
    .footer { padding: 24px; text-align: center; font-size: 12px; color: #6b7280; background: #f3f4f6; }
    .footer a { color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .info-box { background: #eff6ff; border-left: 4px solid #1e40af; padding: 12px 16px; margin: 16px 0; }
    .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{storeName}}</h1>
    </div>
    <div class="content">
      {{content}}
    </div>
    <div class="footer">
      <p>Bu e-posta {{storeName}} tarafından gönderilmiştir.</p>
      <p>© {{year}} {{storeName}}. Tüm hakları saklıdır.</p>
      <p>
        <a href="{{siteUrl}}/kvkk">KVKK Aydınlatma Metni</a> |
        <a href="{{siteUrl}}/iletisim">İletişim</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

// ===========================================================================
// Şablonlar
// ===========================================================================

export const ORDER_CONFIRMATION_TEMPLATE: RenderedEmail = renderEmailTemplate(
  {
    subject: 'Siparişiniz Alındı — {{orderNumber}}',
    text: `Merhaba {{customerName}},

Siparişiniz başarıyla alındı!

Sipariş No: {{orderNumber}}
Toplam: {{total}} {{currency}}

Siparişiniz en kısa sürede hazırlanacaktır.

Saygılarımızla,
{{storeName}}`,
    html: BASE_LAYOUT,
  },
  {
    title: 'Sipariş Onayı',
    storeName: '{{storeName}}',
    siteUrl: '{{siteUrl}}',
    year: new Date().getFullYear(),
    customerName: '{{customerName}}',
    orderNumber: '{{orderNumber}}',
    total: '{{total}}',
    currency: '{{currency}}',
    content: `
      <h2>Merhaba {{customerName}},</h2>
      <p>Siparişiniz başarıyla alındı. En kısa sürede hazırlanıp kargoya verilecektir.</p>

      <div class="info-box">
        <strong>Sipariş No:</strong> {{orderNumber}}<br>
        <strong>Toplam:</strong> {{total}} {{currency}}
      </div>

      <h3>Sipariş Kalemleri</h3>
      <table>
        <thead>
          <tr>
            <th>Ürün</th>
            <th>Adet</th>
            <th>Fiyat</th>
          </tr>
        </thead>
        <tbody>
          {{#if items}}
          {{items}}
          {{/if}}
        </tbody>
      </table>

      <p>
        <a href="{{siteUrl}}/siparis-takip/{{orderNumber}}" class="button">Siparişimi Takip Et</a>
      </p>

      <p>Sorularınız için <a href="{{siteUrl}}/iletisim">bize ulaşın</a>.</p>
    `,
  },
);

export const ORDER_STATUS_CHANGED_TEMPLATE: RenderedEmail = renderEmailTemplate(
  {
    subject: 'Sipariş Durumu Güncellendi — {{orderNumber}}',
    text: `Merhaba {{customerName}},

Siparişinizin durumu güncellendi.

Sipariş No: {{orderNumber}}
Yeni Durum: {{newStatusLabel}}
{{#if trackingNumber}}
Kargo Takip No: {{trackingNumber}}
{{/if}}

Saygılarımızla,
{{storeName}}`,
    html: BASE_LAYOUT,
  },
  {
    title: 'Sipariş Durumu',
    storeName: '{{storeName}}',
    siteUrl: '{{siteUrl}}',
    year: new Date().getFullYear(),
    customerName: '{{customerName}}',
    orderNumber: '{{orderNumber}}',
    newStatusLabel: '{{newStatusLabel}}',
    trackingNumber: '{{trackingNumber}}',
    content: `
      <h2>Merhaba {{customerName}},</h2>
      <p>Siparişinizin durumu güncellendi.</p>

      <div class="info-box">
        <strong>Sipariş No:</strong> {{orderNumber}}<br>
        <strong>Yeni Durum:</strong> {{newStatusLabel}}
      </div>

      {{#if trackingNumber}}
      <h3>Kargo Takibi</h3>
      <p>
        <strong>Takip No:</strong> {{trackingNumber}}<br>
        <a href="{{trackingUrl}}" class="button">Kargoyu Takip Et</a>
      </p>
      {{/if}}
    `,
  },
);

export const DEALER_APPROVED_TEMPLATE: RenderedEmail = renderEmailTemplate(
  {
    subject: 'Bayilik Başvurunuz Onaylandı',
    text: `Sayın {{contactName}},

{{dealerName}} adına yaptığınız bayilik başvurusu onaylanmıştır.

Vade: {{paymentTermDays}} gün
{{#if creditLimit}}
Kredi Limiti: {{creditLimit | currency:"TRY"}}
{{/if}}

Artık B2B fiyat listelerimizden alışveriş yapabilirsiniz.

Saygılarımızla,
{{storeName}}`,
    html: BASE_LAYOUT,
  },
  {
    title: 'Bayilik Onayı',
    storeName: '{{storeName}}',
    siteUrl: '{{siteUrl}}',
    year: new Date().getFullYear(),
    contactName: '{{contactName}}',
    dealerName: '{{dealerName}}',
    paymentTermDays: '{{paymentTermDays}}',
    creditLimit: '{{creditLimit}}',
    content: `
      <h2>Sayın {{contactName}},</h2>
      <p><strong>{{dealerName}}</strong> adına yaptığınız bayilik başvurusu onaylanmıştır.</p>

      <div class="info-box">
        <strong>Vade:</strong> {{paymentTermDays}} gün<br>
        {{#if creditLimit}}
        <strong>Kredi Limiti:</strong> {{creditLimit | currency:"TRY"}}
        {{/if}}
      </div>

      <p>Artık B2B fiyat listelerimizden alışveriş yapabilir ve teklif talebi oluşturabilirsiniz.</p>

      <p>
        <a href="{{siteUrl}}/b2b" class="button">B2B Panele Git</a>
      </p>
    `,
  },
);

export const KVKK_DATA_EXPORT_READY_TEMPLATE: RenderedEmail = renderEmailTemplate(
  {
    subject: 'KVKK Veri İhraç Talebiniz Hazır',
    text: `Sayın {{customerName}},

KVKK Madde 11 kapsamında talep ettiğiniz veri ihracı hazırlanmıştır.

İndirme Bağlantısı: {{downloadUrl}}
Son Kullanma: {{expiresAt | date}}

Güvenliğiniz için bağlantı 7 gün sonra geçerliliğini yitirecektir.

Saygılarımızla,
{{storeName}}`,
    html: BASE_LAYOUT,
  },
  {
    title: 'Veri İhraç Hazır',
    storeName: '{{storeName}}',
    siteUrl: '{{siteUrl}}',
    year: new Date().getFullYear(),
    customerName: '{{customerName}}',
    downloadUrl: '{{downloadUrl}}',
    expiresAt: '{{expiresAt}}',
    content: `
      <h2>Sayın {{customerName}},</h2>
      <p>KVKK Madde 11 kapsamında talep ettiğiniz veri ihracı hazırlanmıştır.</p>

      <div class="warning-box">
        <strong>Önemli:</strong> Güvenliğiniz için bu bağlantı 7 gün sonra geçerliliğini yitirecektir.
      </div>

      <p>
        <a href="{{downloadUrl}}" class="button">Verilerimi İndir</a>
      </p>

      <p><small>Son kullanma: {{expiresAt | date}}</small></p>
    `,
  },
);

// ===========================================================================
// Sipariş durumu Türkçe etiketleri
// ===========================================================================

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Beklemede',
  pending_payment: 'Ödeme Bekleniyor',
  awaiting_payment: 'Ödeme Onayı Bekleniyor',
  paid: 'Ödendi',
  confirmed: 'Onaylandı',
  preparing: 'Hazırlanıyor',
  partially_shipped: 'Kısmen Kargolandı',
  shipped: 'Kargoya Verildi',
  delivered: 'Teslim Edildi',
  returned: 'İade Edildi',
  refunded: 'İade Ödemesi Yapıldı',
  cancelled: 'İptal Edildi',
  failed: 'Başarısız',
  closed: 'Kapandı',
  on_hold: 'Beklemede',
};