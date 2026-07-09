# Faz 21 — Help Center & Ticket Sistemi

**Tarih:** 2026-07-07
**Süre:** ~3 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Tenant'lar destek taleplerini **in-app** açabilsin, super admin yönetebilsin:
- Ticket oluşturma
- Mesajlaşma (tenant ↔ admin)
- Status tracking
- Admin atama
- Çözüm/kapatma
- Email bildirimleri
- İstatistikler

---

## 2. Mimari

```
┌────────────────────────────────────────────────────────────────┐
│  Tenant Admin (apps/tenant-admin/app/support)                  │
│  /support           → Ticket listesi                            │
│  /support/new       → Yeni ticket oluştur                       │
│  /support/:id       → Detay + mesajlaşma + reply                │
└────────────────────┬───────────────────────────────────────────┘
                     │ JWT auth
                     ▼
┌────────────────────────────────────────────────────────────────┐
│  commerce-backend (TicketService + TicketController)          │
│  /support/tickets       (CRUD, tenant-scoped)                  │
│  /support/tickets/:id   (detay, mesajlar)                       │
└────────────────────┬───────────────────────────────────────────┘
                     │ pg.Pool
                     ▼
       PostgreSQL: support_tickets, support_ticket_messages

┌────────────────────────────────────────────────────────────────┐
│  Super Admin (apps/control-plane/src/support)                  │
│  /api/v1/support/tickets            → Tüm ticket'lar          │
│  /api/v1/support/tickets/:id/messages → Internal mesajlar    │
│  /api/v1/support/tickets/:id/assign → Admin atama              │
│  /api/v1/support/tickets/:id/status → Status değiştir          │
│  /api/v1/support/stats               → Platform istatistikleri  │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Ticket Akışı

```
┌──────────┐
│  Tenant  │  POST /support/tickets
│  Admin   │  → status: open
└────┬─────┘
     │ email notification → super admin
     ▼
┌──────────────┐
│  Super Admin │  POST /support/tickets/:id/assign
│  Dashboard   │  → status: assigned (admin atandı)
└────┬─────────┘
     │ ilk admin mesajı yazılınca
     ▼ status: in_progress
┌──────────────┐
│  Yazışma     │  POST /support/tickets/:id/messages
│  (karşılıklı)│  (tenant ↔ admin)
└────┬─────────┘
     │ admin: "yardım edildi"
     ▼ status: resolved
┌──────────────┐
│  Kapatma     │  POST /support/tickets/:id/close
│              │  → status: closed
└──────────────┘
```

---

## 4. API Endpoint'ler

### 4.1 Ticket Oluşturma

```http
POST /support/tickets
{
  "subject": "Ödeme sırasında hata",
  "description": "Stripe checkout 3D Secure sonrası 'Ödeme başarısız' hatası alıyorum.",
  "category": "technical",
  "priority": "high",
  "tags": ["stripe", "3d-secure"]
}

→ 201 Created
{
  "id": "ticket-1",
  "subject": "Ödeme sırasında hata",
  "status": "open",
  "priority": "high",
  "category": "technical",
  "customerEmail": "admin@magaza.com",
  "customerName": "Ahmet Yıldız",
  "createdAt": "2026-07-07T10:00:00.000Z",
  ...
}
```

**Validation:**
- subject: 5-200 karakter
- description: min 10 karakter
- category: enum (general, billing, technical, feature_request, bug_report, integration, other)
- priority: enum (low, normal, high, urgent)
- tags: max 10

### 4.2 Ticket Listesi

```http
GET /support/tickets?status=open&priority=high&page=1&limit=20

→ 200 OK
{
  "items": [
    { "id": "ticket-1", "subject": "...", "status": "open", "priority": "high", "messageCount": 3, ... }
  ],
  "total": 25,
  "page": 1,
  "limit": 20
}
```

**Sıralama:** priority (urgent → low), sonra updated_at DESC.

### 4.3 Mesaj Ekleme

```http
POST /support/tickets/:id/messages
{ "body": "Sorunu şu şekilde çözdük..." }

→ 201 Created
{
  "id": "msg-1",
  "ticketId": "ticket-1",
  "authorType": "customer",
  "authorEmail": "...",
  "body": "...",
  "isInternal": false,
  "createdAt": "..."
}
```

**Status otomatik geçiş:**
- Admin ilk mesaj yazdığında `open → in_progress`

### 4.4 Super Admin Stats

```http
GET /api/v1/support/stats

→ 200 OK
{
  "open": 12,
  "inProgress": 5,
  "waitingCustomer": 3,
  "resolved": 45,
  "avgFirstResponseMinutes": 47.5
}
```

---

## 5. Veritabanı

```sql
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  category VARCHAR(30) NOT NULL DEFAULT 'general',
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(200) NOT NULL,
  assigned_to VARCHAR(255),
  assigned_to_email VARCHAR(255),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE TABLE public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_type VARCHAR(20) NOT NULL,  -- customer, super_admin, system
  author_id UUID,
  author_email VARCHAR(255) NOT NULL,
  author_name VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  attachments TEXT[] DEFAULT '{}',
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_tenant_status
  ON public.support_tickets(tenant_id, status, priority);
CREATE INDEX idx_tickets_assigned
  ON public.support_tickets(assigned_to, status);
CREATE INDEX idx_messages_ticket
  ON public.support_ticket_messages(ticket_id, created_at);
```

---

## 6. Help Center UI

**Tenant Admin (`apps/tenant-admin/src/app/support/`):**

- **`/support`** — Ticket listesi (filtre, status badge, priority indicator)
- **`/support/new`** — Yeni ticket formu (kategori, öncelik, konu, açıklama)
- **`/support/:id`** — Ticket detayı (mesaj geçmişi, reply form)

**Super Admin (`apps/super-admin/src/app/support/` — gelecek sprint):**
- Tüm tenant'ların ticket'ları
- Admin atama dropdown
- Internal notes (sadece admin görür)
- Bulk close/reopen

---

## 7. Mimari Kararlar

### 7.1 Status Machine
```
open → assigned → in_progress ↔ waiting_customer
                              ↓
                          resolved → closed
```

### 7.2 Priority Sıralama
- `urgent` (1) → `high` (2) → `normal` (3) → `low` (4)
- Tüm listelerde önce priority, sonra updated_at

### 7.3 Internal Notes
- `is_internal: true` → sadece admin görür
- Tenant API'inde filtrelenir
- Customer-friendly mesajlar için ayrı kullanılır

### 7.4 Fire-and-Forget Email
- `emailQueue?.enqueue()` — null ise skip
- Email hatası ticket oluşturmayı engellemez
- Promise.catch ile log

### 7.5 Auto Status Transition
- Admin ilk mesaj → `open → in_progress`
- Status değişikliği tek satır SQL CASE

### 7.6 First Response Time
- Avg = (ilk admin mesaj - ticket created)
- 47.5 dakika gibi metriklerle destek ekibi SLA takibi

### 7.7 Multi-Channel
- Email: support@eticart.com.tr
- Web: in-app
- Telefon: Faz 22'de (Twilio integration)
- Chat: Faz 22'de (Crisp/Intercom)

---

## 8. Test Sonuçları

### Yeni Testler (15)

| Test | Sayı | Sonuç |
|------|------|-------|
| `ticket.service.test.ts` | 15 | ✅ |

**Kapsam:**
- `createTicket()` — başarı, validation, email queue hatası
- `listTickets()` — tenant-scoped, super admin, priority sıralama
- `getTicket()` — mevcut/olmayan
- `addMessage()` — customer/admin, status transition, validation
- `updateStatus()` — resolved/closed timestamp
- `assign()` — admin atama
- `getStats()` — 4 stat + avg first response

### Tüm Proje Test Özeti

| Paket | Test | Sonuç |
|------|------|-------|
| commerce-backend | **208** | ✅ (+15) |
| plugin-sdk | 19 | ✅ |
| control-plane | 63 | ✅ |
| storefront | 59 | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **521+** ✅ | **+15 yeni** |

---

## 9. Dosya Yapısı (Faz 21)

```
apps/commerce-backend/src/modules/support/    # 🆕
├── ticket.service.ts                          # 14.6 KB (CRUD, stats, email)
├── ticket.controller.ts                       # 5.9 KB (tenant API)
├── support.module.ts
└── __tests__/ticket.service.test.ts           # 15 test

apps/control-plane/src/support/                # 🆕 Super admin
├── support.controller.ts                       # 5.4 KB
└── support.module.ts

apps/tenant-admin/src/app/support/             # 🆕 UI
├── page.tsx                                   # 5.5 KB — liste
├── new/
│   ├── page.tsx                               # Form container
│   └── NewTicketForm.tsx                       # 5.4 KB — form
└── [id]/
    ├── page.tsx                               # 4 KB — detay
    └── TicketReplyForm.tsx                    # 2.8 KB — reply
```

---

## 10. Production Checklist

- [x] Tenant-scoped authorization
- [x] Status machine (open → assigned → in_progress → resolved → closed)
- [x] Priority sıralama
- [x] Email bildirimler (fire-and-forget)
- [x] Validation (Zod)
- [x] Auto status transition (admin ilk mesaj)
- [x] Resolved/closed timestamps
- [x] Stats (avg first response time)
- [ ] Email templates (welcome, new message, status change) — Faz 21.5
- [ ] SLA escalation (urgent → 1 saat yanıt zorunlu)
- [ ] Canned responses (admin hızlı yanıt)
- [ ] Attachments (S3/R2 upload)
- [ ] Public help center + knowledge base (Faz 21.5)
- [ ] CSAT (customer satisfaction) survey

---

## 11. Sprint 22+ Önerileri

| Sprint | İçerik | Süre |
|--------|--------|------|
| **21.5** | Email templates + public knowledge base | 3 gün |
| **22** | Super admin SSO + RBAC | 3 gün |
| **23** | Plugin sandboxing + versioning | 5 gün |
| **24** | Mobile app (React Native + Expo) | 14+ gün |
| **25** | AI destekli auto-respond (LLM) | 7 gün |
| **26** | Multi-region + CDN | 7 gün |

---

*Son güncelleme: 2026-07-07 — Faz 21 Help Center*
*Toplam: 41+ Faz, 521+ test*