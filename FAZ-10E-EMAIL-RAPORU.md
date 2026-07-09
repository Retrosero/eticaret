# Faz 10E — E-posta Bildirimleri (SMTP + Resend)

**Tarih:** 2026-07-05/06
**Süre:** ~3 saat (paralel + sıralı çalışma)
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Ticari olaylarda (sipariş, bayi onayı, KVKK) müşteri ve bayiye otomatik e-posta bildirimi göndermek. Çoklu sağlayıcı desteği (SMTP + Resend) ve kuyruk tabanlı asenkron işleme.

---

## 2. Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                     @eticart/notification-adapters               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ common/      │  │ smtp/        │  │ resend/      │            │
│  │ - types      │  │ - SmtpClient │  │ - ResendClient│           │
│  │ - template   │  │ (Nodemailer) │  │ (HTTP API)   │            │
│  │ - templates  │  └──────────────┘  └──────────────┘            │
│  │ (4 hazır)    │                                                │
│  └──────────────┘                                                │
│  ┌──────────────┐                                                │
│  │ queue/       │                                                │
│  │ - InMemoryQ  │                                                │
│  │ - createHndlr│ (retry, exp backoff)                          │
│  │ - DEFAULT_*  │                                                │
│  └──────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  apps/commerce-backend                           │
├─────────────────────────────────────────────────────────────────┤
│  modules/notification/notification-service.ts                    │
│   ├─ enqueueOrderConfirmation()                                  │
│   ├─ enqueueOrderStatusChanged()                                 │
│   ├─ enqueueDealerApproved()                                     │
│   └─ enqueueKvkkDataExportReady()                                │
│                                                                  │
│  Hook'lar:                                                       │
│   ├─ checkout-service.ts   → order.confirmation                  │
│   ├─ order.controller.ts  → order.status_changed                 │
│   └─ approval.controller.ts → dealer.approved                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Yapılan İşler

### 3.1 Paket — `packages/notification-adapters/`

**Modüller:**

| Modül | Dosya | Açıklama |
|------|-------|---------|
| `common/types.ts` | `NotificationAdapter`, `EmailAddress`, `SendEmailRequest`, `SendEmailResult`, `NotificationEvent` (4 union tip) |
| `common/template.ts` | `renderTemplate()` — Handlebars benzeri motor (`{{x}}`, `{{{x}}}`, `{{#if}}`); htmlEscape (XSS), helpers: `currency`, `date`, `upper`, `lower`, `default` |
| `common/templates.ts` | 4 hazır şablon: `ORDER_CONFIRMATION`, `ORDER_STATUS_CHANGED`, `DEALER_APPROVED`, `KVKK_DATA_EXPORT_READY` |
| `smtp/client.ts` | Nodemailer dynamic import, lazy transporter, attachment/inline image, KVKK header'ları (`X-Mailer: eticart-notification-adapters`) |
| `resend/client.ts` | `api.resend.com` HTTP API, Bearer token, Idempotency-Key desteği |
| `queue/email-queue.ts` | `InMemoryQueue` (test/dev), `createEmailQueueHandler()` (retry + exponential backoff), `DEFAULT_ADAPTER_BY_EVENT`, `DEFAULT_TEMPLATE_BY_EVENT` |

**Template motoru özellikleri:**
- `{{degisken}}` → HTML escape (XSS koruması)
- `{{{raw}}}` → escape yok
- `{{#if kosul}}...{{/if}}` → koşullu blok
- Helper'lar: `currency`, `date`, `upper`, `lower`, `default:"misafir"`
- `renderEmailTemplate()` → subject (raw), text (raw), html (escaped)

**Şablonlar:**

1. **ORDER_CONFIRMATION**
   - Konu: `Siparişiniz Onaylandı — {{orderNumber}}`
   - Değişkenler: orderNumber, customerName, total, currency, orderUrl
   - Türkçe düz metin + responsive HTML

2. **ORDER_STATUS_CHANGED**
   - Konu: `Sipariş Durumunuz Güncellendi — {{orderNumber}}`
   - `{{#if trackingNumber}}` koşullu kargo takip linki
   - Türkçe durum etiketleri (pending→"Beklemede", shipped→"Kargoya Verildi" vb.)

3. **DEALER_APPROVED**
   - Konu: `Bayi Başvurunuz Onaylandı`
   - `{{#if creditLimit}}` koşullu kredi limiti
   - Giriş URL'si

4. **KVKK_DATA_EXPORT_READY**
   - Konu: `KVKK Veri Dışa Aktarımınız Hazır`
   - İndirme linki + son kullanma tarihi
   - KVKK uyumlu disclaimer

**Adapter'lar:**

| Adapter | API | Auth | Test |
|--------|-----|------|------|
| SmtpClient | SMTP | `user:password` | Mock transport |
| ResendClient | HTTPS | `Bearer re_xxx` | Mock axios |

### 3.2 Backend — `apps/commerce-backend/`

**Yeni modül:** `modules/notification/`

- `notification-service.ts` — Singleton service, lazy env konfigürasyonu, InMemoryQueue wrapper
- `notification.module.ts` — `@Global()` NestJS modülü (`NOTIFICATION_SERVICE` token)

**Hook'lar:**

| Olay | Tetikleyici | Şablon | Adapter |
|------|------------|-------|--------|
| `order.confirmation` | `checkout-service.ts` — sipariş create sonrası | ORDER_CONFIRMATION | smtp |
| `order.status_changed` | `order.controller.ts` — `transition` endpoint'i sonrası | ORDER_STATUS_CHANGED | smtp |
| `dealer.approved` | `approval.controller.ts` — `approve` sonrası | DEALER_APPROVED | smtp |
| `kvkk.data_export_ready` | (gelecek) `customer-panel` veri export hazır olunca | KVKK_DATA_EXPORT_READY | smtp |

**Hata dayanıklılığı:**
- Tüm hook'lar `try/catch` ile sarıldı — notification hatası **ana işlemi engellemez** (fire-and-forget)
- Email gönderilemezse sipariş/dealer onayı başarılı sayılır, sadece loglanır

### 3.3 Queue İşleyişi

```
1. NotificationService.enqueueOrderConfirmation() çağrılır
   ↓
2. EmailQueueJob oluşturulur (jobId: 'order-confirmation:{orderId}')
   ↓
3. InMemoryQueue.enqueue() → jobs[] push + setImmediate(process)
   ↓
4. createEmailQueueHandler() → şablon render + alıcı çözümleme
   ↓
5. Adapter.sendEmail() → max 3 retry, exp backoff (1s, 2s, 4s)
   ↓
6. Sonuç: başarı → "sent" log; başarısızlık → "all retries failed" log
```

**Prod'da BullMQ:** `email-queue.ts` BullMQ interface'i korur; implementasyon Redis ile değiştirilebilir.

---

## 4. Ortam Değişkenleri

```bash
# SMTP (zorunlu prod'da)
SMTP_HOST=smtp.yandex.com.tr
SMTP_PORT=587
SMTP_USER=noreply@eticart.com.tr
SMTP_PASSWORD=xxx
SMTP_SECURE=false

# Resend (opsiyonel — HTTP API modern alternatif)
RESEND_API_KEY=re_xxxxxxxxxx

# Default 'From' adresi
MAIL_FROM=noreply@eticart.com.tr
MAIL_FROM_NAME=eticart

# Storefront / Admin URL'leri (şablonlarda link için)
STOREFRONT_URL=https://eticart.com.tr
ADMIN_URL=https://admin.eticart.com.tr
```

---

## 5. Test Sonuçları

| Paket | Test | Tip-hata |
|------|------|---------|
| commerce-backend (Vitest) | **52/52** ✅ (6 yeni notification testi) | 0 |
| payment-adapters | 51/51 ✅ | - |
| shipping-adapters | 39/39 ✅ | - |
| storefront | 25/25 ✅ | - |
| einvoice-adapters | 13/13 ✅ | 0 |
| **notification-adapters** | **34/34** ✅ | **0** |
| **TOPLAM** | **214/214** ✅ | **0** |

**Notification adapter test dağılımı:**
- Template Engine: 11
- E-posta Şablonları: 5
- ResendClient: 6
- SmtpClient: 5
- NotificationAdapterRegistry: 1
- Email Queue (InMemoryQueue + Handler): 6

---

## 6. Bilinen Sınırlamalar / TODO

1. **BullMQ prod implementasyonu:** Şu an InMemoryQueue kullanılıyor. Prod'da Redis-backed BullMQ Worker process'i ayrı bir container olarak çalıştırılmalı.
2. **SMS/Push adaptörleri:** Interface hazır (`supportsSms`, `supportsPush`) ama implementasyon yok. İlk hedef: Turkcell/Vodafone SMS gateway.
3. **Template yönetim UI:** Şablonlar şu an kodda. İleride admin panelden özelleştirilebilir olmalı (Faz 11+).
4. **Bounce/complaint handling:** Resend webhook + SMTP bounce mailbox okuma (faz 11+).
5. **KVKK data_export_ready hook:** customer-panel modülünde henüz tetiklenmiyor (sadece service hazır).

---

## 7. Sıradaki Sprint Önerisi

1. **E2E testler** (Playwright + supertest): sipariş → admin onayı → email kuyruğu
2. **Multi-tenant storage** (S3/R2 tenant-bazlı bucket)
3. **Production hardening:** rate limit, CSRF, security audit (OWASP)
4. **BullMQ + Redis prod konfigürasyonu**

---

## 8. Kritik Dosya Yolları

```
packages/notification-adapters/
├── src/
│   ├── common/
│   │   ├── types.ts                  # NotificationAdapter interface
│   │   ├── template.ts               # Template motoru
│   │   ├── templates.ts              # 4 hazır şablon
│   │   └── index.ts
│   ├── smtp/
│   │   ├── client.ts                 # SmtpClient (Nodemailer)
│   │   └── index.ts
│   ├── resend/
│   │   ├── client.ts                 # ResendClient (HTTP API)
│   │   └── index.ts
│   ├── queue/
│   │   ├── email-queue.ts            # InMemoryQueue + Handler
│   │   └── index.ts
│   └── index.ts
├── run-tests.mjs                     # 34 test
└── package.json

apps/commerce-backend/
├── src/modules/notification/
│   ├── notification-service.ts       # Singleton service
│   ├── notification.module.ts        # NestJS @Global() module
│   └── __tests__/
│       └── notification-service.test.ts  # 6 entegrasyon testi
└── src/modules/checkout/checkout-service.ts   # order.confirmation hook
└── src/modules/order/order.controller.ts      # order.status_changed hook
└── src/modules/b2b-application/approval.controller.ts  # dealer.approved hook
```