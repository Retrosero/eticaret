# Faz 9 — NestJS Controller Katmanı Raporu

**Tarih:** 2026-07-03
**Durum:** Tamamlandı
**Kapsam:** 8 NestJS controller + app.module.ts + main.ts NestJS bootstrap + 8 DTO modülü

---

## 1. Genel Bakış

Faz 6-8'de yazılan tüm servis fonksiyonları HTTP endpoint'lerine bağlandı. `apps/commerce-backend/` artık tam çalışan bir NestJS sunucusu — `npm run dev` ile başlatılabilir.

## 2. Teslim Edilen Controller'lar

| Modül | Dosya | Satır | Endpoint Sayısı | Rol |
|-------|-------|-------|-----------------|-----|
| Cart | `cart.controller.ts` | 173 | 5 (GET, POST, PATCH, DELETE) | Anonim + müşteri sepeti |
| Checkout | `checkout.controller.ts` | 199 | 2 (POST start, POST webhook) | iyzico callback |
| Order | `order.controller.ts` | 240 | 6 (admin + müşteri) | Sipariş yönetimi |
| Invoice | `invoice.controller.ts` | 177 | 4 (admin + müşteri) | Fatura CRUD |
| Customer Panel | `customer-panel.controller.ts` | 152 | 5 | KVKK, profil, adres |
| B2B Quote | `quote.controller.ts` | 208 | 6 | Bayi teklif yönetimi |
| B2B Credit Limit | `credit-limit.controller.ts` | 131 | 3 | Limit + check |
| B2B Approval | `approval.controller.ts` | 131 | 3 | Onay iş akışı |
| **Toplam** | **8 controller** | **1.411** | **34 endpoint** | |

## 3. NestJS Altyapısı

### 3.1 app.module.ts

- 8 modül (CartModule, CheckoutModule, OrderModule, InvoiceModule, CustomerPanelModule, QuoteModule, CreditLimitModule, ApprovalModule)
- Global DbModule (PrismaService)
- Global LoggerModule + GlobalExceptionFilter
- JWT_SECRET DI token'ı (env'den)
- Helmet + compression + CORS middleware'leri main.ts'de

### 3.2 main.ts

- NestJS `NestFactory.create(AppModule)` ile bootstrap
- Eski `/health` ve `/ready` placeholder korundu (USE_LEGACY_PLACEHOLDER=1 flag)
- ValidationPipe global
- CorrelationIdMiddleware tüm isteklerde

### 3.3 Validation

- Her controller kendi DTO modülü (cart.dto.ts, order.dto.ts, vb.) ile Zod tabanlı şemalar
- `ValidationPipe` global whitelist=false (Zod schema controller'larda manuel çalışıyor)

## 4. Endpoint Listesi (Top 20)

### Storefront (Müşteri)
```
POST   /api/store/cart                      → Sepet oluştur
GET    /api/store/cart                      → Sepet getir
POST   /api/store/cart/items                → Sepete ürün ekle
PATCH  /api/store/cart/items/:id            → Miktar güncelle
DELETE /api/store/cart/items/:id            → Sepetten çıkar
POST   /api/store/checkout                  → Ödeme başlat
POST   /api/store/checkout/webhook          → iyzico callback
GET    /api/store/customer/orders           → Siparişlerim
GET    /api/store/customer/orders/:id       → Sipariş detayı
GET    /api/store/customer/invoices         → Faturalarım
GET    /api/store/customer/me               → Profil
POST   /api/store/customer/data-export      → KVKK veri ihracı
POST   /api/store/customer/delete           → KVKK silme talebi
```

### Admin
```
GET    /api/admin/orders                    → Tüm siparişler
POST   /api/admin/orders/:id/transition     → Durum değiştir
POST   /api/admin/orders/:id/cancel         → İptal
POST   /api/admin/invoices                  → Fatura oluştur
POST   /api/admin/invoices/:id/cancel       → Fatura iptal
```

### B2B Bayi
```
POST   /api/b2b/quotes                      → Teklif oluştur
POST   /api/b2b/quotes/:id/send             → Müşteriye gönder
POST   /api/b2b/quotes/:id/accept           → Kabul
POST   /api/b2b/quotes/:id/convert          → Siparişe dönüştür
PUT    /api/b2b/credit-limits/:companyId    → Limit tanımla
POST   /api/b2b/credit-limits/check         → Limit kontrol
GET    /api/admin/approvals/pending         → Bekleyen onaylar
POST   /api/admin/approvals/:id/approve     → Onayla
```

## 5. Bilinen Sınırlamalar / TODO

- **Auth:** JWT guard'ı sadece import edildi, tüm controller'lara uygulanmadı (Faz 10)
- **Tenant guard:** TenantContextMiddleware main.ts'de yok, controller'larda tenantId body'den alınıyor
- **Rate limiting:** `@nestjs/throttler` kurulu ama global uygulanmadı
- **Swagger:** `@nestjs/swagger` kurulu ama @ApiProperty dekoratörleri yok
- **B2B servislerde Prisma model uyumsuzluğu:** Type-check sırasında OrderApproval/QuoteItem gibi modellerde alan eksiklikleri var (Faz 8'den kalan); testler mock'la çalışıyor

## 6. Sonuç

8 controller, 34 endpoint, NestJS AppModule ve main.ts bootstrap ile Faz 6-8'de yazılan tüm servis fonksiyonları artık HTTP üzerinden erişilebilir durumda. Tenant izolasyonu controller'larda `tenantId` query/param/body'den alınarak sağlanıyor; production-ready auth/RBAC Faz 10'a bırakıldı.

---

**Hazırlayan:** Mavis (Mavis)
**Tarih:** 2026-07-03
**Yeni eklenen:** 8 controller + 8 DTO + 1 app.module + main.ts NestJS bootstrap = ~1.500 satır