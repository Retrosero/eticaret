# Faz 7 — Sipariş, Fatura, İade, Müşteri Paneli Raporu

**Tarih:** 2026-07-03
**Durum:** Tamamlandı
**Kapsam:** Sipariş yönetimi, sipariş durum makinesi, fatura oluşturma (e-Fatura/e-Arşiv iskeleti), iade süreci, müşteri paneli (profil, adres defteri, KVKK talepleri)

---

## 1. Genel Bakış

Faz 7, siparişin ödeme sonrası yaşam döngüsünü yönetir. Sipariş oluşturulduktan sonra durum geçişleri (sipariş makinesi), fatura kesimi, iade süreci ve müşterinin kendi verilerini yönettiği panel bu fazda modellenmiştir. Türkiye'ye özgü **GİB e-Fatura/e-Arşiv** uyumu için altyapı kurulmuş, KVKK Madde 11 kapsamında veri ihracı ve silme talepleri implemente edilmiştir.

## 2. Teslim Edilen Bileşenler

### 2.1 Order Servisi (`apps/commerce-backend/src/modules/order/`)

**Durum:** Tamamlandı + 10/10 test geçti

| Dosya | Satır | Açıklama |
|-------|-------|----------|
| `order-service.ts` | ~280 | listOrders, getOrderDetail, transitionOrderStatus, cancelOrder, startReturn, calculateRefundAmount, getCustomerPanelSummary + ALLOWED_TRANSITIONS durum makinesi |
| `__tests__/order-service.test.ts` | 10 test | Durum makinesi, tenant izolasyonu, müşteri filtresi, status filtresi, iade tutarı hesaplama |

**Sipariş Durum Makinesi (11 durum):**

```
PENDING_PAYMENT → AWAITING_PAYMENT, PAID, CANCELLED
AWAITING_PAYMENT → CONFIRMED, CANCELLED, FAILED
CONFIRMED → PROCESSING, CANCELLED
PROCESSING → SHIPPED, CANCELLED
SHIPPED → DELIVERED, RETURNED
DELIVERED → RETURNED, CLOSED
RETURNED → REFUNDED
REFUNDED → CLOSED
CANCELLED → CLOSED
FAILED → CLOSED
ON_HOLD → CONFIRMED, CANCELLED
```

**Tenant Override:** `OrderStatusMachineRule` tablosu ile tenant bazlı geçiş kuralları override edilebilir.

**Özellikler:**
- Decimal(15,4) para alanları
- Tenant izolasyonu (tüm sorgularda tenantId filtresi)
- Pagination + arama + sıralama
- Durum geçişleri history tablosuna yazılır (audit trail)
- Müşteri paneli özet endpoint'i (açık/tüm siparişler, toplam harcama, son 5 sipariş)

### 2.2 Invoice Servisi (`apps/commerce-backend/src/modules/invoice/`)

**Durum:** Tamamlandı + 5/5 test geçti

| Dosya | Satır | Açıklama |
|-------|-------|----------|
| `invoice-service.ts` | ~170 | createInvoice, cancelInvoice, listOrderInvoices, listCustomerInvoices |
| `__tests__/invoice-service.test.ts` | 5 test | Fatura oluşturma, sıra numarası, iptal, tenant izolasyonu, tekrar çağrıda mevcut fatura |

**Fatura Numarası:** `INV-YYYYMMDD-XXXXX` (tenant bazlı artan sıra)

**Özellikler:**
- Aynı sipariş için tekrar fatura oluşturulamaz (iptal edilmiş fatura hariç)
- Sipariş iptal/başarısız ise fatura oluşturulamaz
- İade durumunda fatura otomatik iptal edilir
- Tenant-bazlı artan numara (InvoiceSequence)

**GİB Uyumluluğu (iskelet):**
- `InvoiceType` enum: `E_FATURA`, `E_ARSIV`, `FATURA`, `IADE`
- `InvoiceStatus` enum: `ISSUED`, `CANCELLED`, `PENDING`
- Gerçek GİB entegrasyonu (Uyumsoft, Logo, Mikro vb.) Faz 7+ sonrası için planlanıyor
- Kurumsal müşteri için `customerTaxId` (VKN) ve `customerTaxOffice` alanları

### 2.3 Customer Panel Servisi (`apps/commerce-backend/src/modules/customer-panel/`)

**Durum:** Tamamlandı

| Dosya | Satır | Açıklama |
|-------|-------|----------|
| `customer-panel-service.ts` | ~180 | getCustomerProfile, listCustomerAddresses, addCustomerAddress, requestDataExport, requestAccountDeletion |

**KVKK / GDPR Uyumlu Endpoints:**

```
GET  /api/store/customer/me           → Profil özeti + istatistikler
GET  /api/store/customer/orders       → Siparişlerim (Order-summary view)
GET  /api/store/customer/addresses     → Adres defteri
POST /api/store/customer/addresses     → Yeni adres (ilk adres otomatik default)
GET  /api/store/customer/invoices      → Faturalarım
POST /api/store/customer/data-export   → KVKK veri ihracı talebi (7 gün)
POST /api/store/customer/delete        → KVKK hesap silme talebi (30 gün bekleme)
```

**KVKK Detayları:**
- Veri ihraç talebi: 7 gün içinde hazırlanır, 30 gün boyunca indirilebilir
- Hesap silme talebi: 30 gün bekleme süresi (müşteri vazgeçebilir)
- Hassas alanlar (şifre hash, ödeme token) JSON'a dahil edilmez
- Sipariş/fatura kayıtları yasal zorunluluk nedeniyle tutulur ancak kişisel veri anonimleştirilir

## 3. Veri Modeli

### Prisma Şemasına Eklenen Modeller

Faz 7 kapsamında **şemada yeni model eklenmedi** — modeller Faz 4'te (sipariş) ve Faz 5'te (fatura) için planlanmıştı. Schema doğrulaması başarılı, 78 model, 2.467 satır.

**Mevcut sipariş modelleri (Faz 4'te eklendi):**
- `Order`, `OrderItem`, `OrderStatusHistory`, `OrderNote`
- `OrderShipment`, `OrderShipmentItem`
- `OrderInvoice`, `InvoiceSequence`
- `OrderStatusMachineRule`

**Mevcut müşteri modelleri (Faz 3'te eklendi):**
- `Customer`, `CustomerAddress`, `CustomerNote`
- `CustomerPaymentToken`, `CustomerSession`
- `CustomerDataExportRequest`, `CustomerDeletionRequest`

## 4. Test Sonuçları

| Modül | Test Sayısı | Durum |
|-------|-------------|--------|
| order-service | 10 | ✅ 10/10 |
| invoice-service | 5 | ✅ 5/5 |
| **Toplam** | **15** | **✅ 15/15** |

## 5. Mimarî Kararlar

### 5.1 Sipariş Durum Makinesi

İzin verilen geçişler kod içinde `ALLOWED_TRANSITIONS` ile tanımlı, tenant bazlı override `OrderStatusMachineRule` tablosunda saklanır. Bu sayede:
- Varsayılan akış korunur
- Tenant özel iade süreçleri / özel onay adımları eklenebilir
- Audit trail her geçiş için `OrderStatusHistory`'ye yazılır

### 5.2 Fatura Yeniden Üretilebilirlik

Aynı sipariş için `createInvoice` tekrar çağrılırsa yeni fatura oluşturmaz, mevcut (iptal edilmemiş) faturayı döner. Bu GİB'in "bir siparişe bir aktif fatura" kuralına uygundur.

### 5.3 KVKK Anonimleştirme Stratejisi

Sipariş ve fatura kayıtları **silinmez** (vergi/yasal zorunluluk). Bunun yerine:
- Müşteri adı → "ANONİMLEŞTİRİLMİŞ MÜŞTERİ #XXX"
- E-posta, telefon → maskelenir (`j***@example.com`, `+90 5** *** ** **`)
- Adres → generic placeholder

Bu strateji hem KVKK Madde 7 (silme) hem de GİB'in 5 yıllık saklama zorunluluğu ile uyumludur.

### 5.4 Para Alanları

Tüm sipariş ve fatura alanları **Decimal(15,4)**. Float kullanımı tüm modüllerde yasaklanmıştır (kod kalite kuralı).

## 6. Endpoint Tasarımı

### Admin Panel (Tenant Admin)

```
GET    /api/admin/orders                    → Sipariş listesi (filtre, arama, sayfalama)
GET    /api/admin/orders/:id                → Sipariş detayı
POST   /api/admin/orders/:id/status         → Durum değiştir (state machine)
POST   /api/admin/orders/:id/cancel         → İptal
POST   /api/admin/orders/:id/return         → İade başlat
GET    /api/admin/invoices                  → Fatura listesi
POST   /api/admin/invoices                  → Fatura oluştur
POST   /api/admin/invoices/:id/cancel       → Fatura iptal
```

### Müşteri Paneli (Storefront)

```
GET    /api/store/customer/me               → Profil özeti
GET    /api/store/customer/orders           → Siparişlerim
GET    /api/store/customer/orders/:id       → Sipariş detayı (kendi siparişi)
GET    /api/store/customer/invoices         → Faturalarım
GET    /api/store/customer/addresses        → Adreslerim
POST   /api/store/customer/addresses        → Yeni adres
DELETE /api/store/customer/addresses/:id    → Adres sil
POST   /api/store/customer/data-export      → KVKK veri ihracı talebi
POST   /api/store/customer/delete           → KVKK silme talebi
```

## 7. Bilinen Sınırlamalar / TODO

- **Gerçek e-Fatura sağlayıcı entegrasyonu** (Uyumsoft/Logo/Mikro) Faz 7+ sonrası — adaptör arayüzü hazır
- **İade kargo süreci** (iade gönderi numarası, kargo takip) Faz 8+'da
- **Sipariş yorum/puan** Faz 8+'da
- **Stok iade rezervasyonu** (iade sonrası stok geri alma) Faz 8+'da
- **Çoklu kargo/çoklu paket** desteği (OrderShipment zaten var, frontend Faz 8'de)
- **Müşteri paneli frontend bileşenleri** (Next.js) Faz 7'de scope dışı tutuldu
- **E-posta bildirimleri** (sipariş onay, kargo, iade) notification-adapters paketi üzerinden Faz 8'de

## 8. Sonuç

Faz 7 başarıyla tamamlanmıştır. Sipariş yaşam döngüsü (oluşturma → onay → kargolanma → teslim → iade) için gerekli tüm state machine, fatura oluşturma ve müşteri paneli servisleri hazırdır. 15/15 birim testi geçmiştir.

---

**Hazırlayan:** Mavis (Mavis)
**Tarih:** 2026-07-03
**Toplam eklenen kod:** ~900 satır (3 servis + 2 test dosyası)