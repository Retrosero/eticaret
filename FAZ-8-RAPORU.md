# Faz 8 — B2B Bayi ve Gelişmiş Fiyatlandırma Raporu

**Tarih:** 2026-07-03
**Durum:** Tamamlandı
**Kapsam:** B2B bayi mimarisi, gelişmiş fiyatlandırma (müşteri grubu, kontrat, volume), bayi teklifleri (Quote), onay iş akışları (Approval Workflow), kredi limiti yönetimi, bayi güvenlik bağlamı

---

## 1. Genel Bakış

Faz 8, SaaS'ın **B2B kanalını** açar. Bayilerin (dealer) kendi müşterilerine yönelik teklifler hazırlaması, sözleşmeli fiyatlandırma kullanması, kredi limiti ile açık hesap sipariş vermesi ve büyük tutarlı siparişler için tenant admin onayı alması bu fazda modellenmiştir. Multi-tenant güvenlik kuralları korunarak, bayi verileri tenant içinde izole edilmiştir.

## 2. Veri Modeli (Prisma Schema)

Faz 8 kapsamında **22 yeni B2B modeli** eklenmiştir:

### 2.1 Bayi Yönetimi

| Model | Açıklama |
|-------|----------|
| `CompanyAccount` | Bayi firma hesabı (VKN, adres, müşteri grubu, kredi limiti, durum) |
| `DealerApplication` | Bayi başvurusu (onay/red, evrak yönetimi) |
| `DealerUser` | Bayiye bağlı kullanıcılar (firma içi rol bazlı erişim) |
| `DealerInvite` | Bayi kullanıcı davetleri (e-posta, token, son kullanma) |
| `DealerBranch` | Bayi şubeleri (çoklu lokasyon) |
| `SalesRepresentative` | Satış temsilcisi (tenant_admin veya bayi üyesi) |

### 2.2 Fiyatlandırma

| Model | Açıklama |
|-------|----------|
| `CustomerGroup` | Bayi grupları (segmentasyon: GOLD, PLATINUM vb.) |
| `CustomerGroupKind` (enum) | STANDARD, VIP, WHOLESALE, RETAIL |
| `PriceSnapshot` | Ürün/varyant için geçmiş fiyat snapshot'ları |

### 2.3 Teklif Yönetimi

| Model | Açıklama |
|-------|----------|
| `Quote` | Müşteriye sunulan teklif (taslak, gönderilmiş, kabul, red, dönüşüm) |
| `QuoteItem` | Teklif kalemleri (SKU, miktar, birim fiyat, indirim yüzdesi) |
| `QuoteStatusHistory` | Teklif durum değişiklikleri (audit) |
| `DealerOrder` | B2B sipariş (Quote'tan dönüştürülmüş) |

### 2.4 Ödeme Koşulları

| Model | Açıklama |
|-------|----------|
| `PaymentTerm` | Ödeme vadesi kuralları (NET30, NET60 vb.) |
| `PaymentTermKind` (enum) | NET, END_OF_MONTH, IMMEDIATE, PREPAYMENT |
| `CreditLimit` | Firma bazlı kredi limiti (limit, kullanım, vade, otomatik onay eşiği) |
| `CreditLimitHistory` | Kredi kullanım geçmişi (reserve, release) |
| `DealerTransaction` | Bayi finansal hareketleri (sipariş, ödeme, alacak) |

### 2.5 Onay İş Akışı

| Model | Açıklama |
|-------|----------|
| `ApprovalWorkflow` | Çok adımlı onay kuralları (kod, adımlar, gerekli roller) |
| `ApprovalStep` | İş akışı adımları (sıra, gerekli rol) |
| `OrderApproval` | Bekleyen/tamamlanan onay talepleri (çok adımlı) |
| `OrderApprovalStatus` (enum) | PENDING, APPROVED, REJECTED, SKIPPED |
| `QuickOrderTemplate` | Hızlı sipariş şablonları (SKU listesi) |

### 2.6 Bayi Görünürlük

| Model | Açıklama |
|-------|----------|
| `DealerProductVisibility` | Bayiye özel ürün görünürlük kuralları |
| `DealerCategoryVisibility` | Bayiye özel kategori görünürlük kuralları |

**Şu anki şema:** 78 model, 2.467 satır, **başarıyla derlendi** (`prisma generate` ✅).

## 3. Teslim Edilen Bileşenler

### 3.1 Bayi Güvenlik Bağlamı (`apps/commerce-backend/src/modules/common/dealer-context.ts`)

**Durum:** Tamamlandı

Bayi sorgularında zorunlu tenant + companyAccountId filtresi sağlayan yardımcı modül:

```typescript
interface DealerContext {
  tenantId: Uuid;
  userId: Uuid;
  companyAccountId: Uuid; // zorunlu — cross-bayi sızıntı önleme
  dealerRole: string;
  isTenantAdmin: boolean;
}
```

- `resolveDealerContext`: Kullanıcının bayi bağlamını çözer (multi-firma desteği)
- `resolveDealerContextAsAdmin`: Tenant admin için bypass
- `dealerScope`: Standart sorgu kapsamı filtresi

**Güvenlik:** Birden fazla firma bağlantısı olan kullanıcı için `companyAccountId` zorunlu; aksi halde `COKLU_FIRMA_SECIM_GEREKLI` hatası. Yetkisiz cross-bayi erişim girişimi `BAYI_YETKISI_YOK` ile reddedilir.

### 3.2 B2B Fiyatlandırma Servisi (`b2b-pricing/`)

**Durum:** Tamamlandı

| Fonksiyon | Açıklama |
|-----------|----------|
| `quoteCompanyPricing` | Bayi için fiyat teklifi hesaplar (Contract > Customer Group > Volume > List önceliği) |
| `quoteQuickOrder` | SKU listesi ile hızlı toplu fiyat hesaplama |

**Fiyat Kuralı Hiyerarşisi:**

1. **CONTRACT (Sözleşme):** Miktar ve müşteri grubu bazlı → %15 indirim tipik
2. **CUSTOMER_GROUP (Müşteri Grubu):** Fiyat listesi üzerinden → %10 indirim
3. **VOLUME (Hacim):** Miktar bazlı → 100+ adet %5, 500+ adet %8
4. **LIST (Liste):** Ürün/varyant baz fiyatı

### 3.3 B2B Teklif Servisi (`b2b-quote/`)

**Durum:** Tamamlandı + 7/7 test geçti

| Fonksiyon | Açıklama |
|-----------|----------|
| `createQuote` | Taslak teklif oluşturur (QT-YYYYMMDD-XXXX numara) |
| `addQuoteItem` | Teklife kalem ekler (Decimal lineTotal hesaplar) |
| `sendQuote` | DRAFT → SENT (boş teklif gönderilemez) |
| `acceptQuote` | SENT → ACCEPTED |
| `rejectQuote` | SENT → REJECTED |
| `convertQuoteToOrder` | ACCEPTED → DealerOrder |

**Teklif Numarası:** `QT-YYYYMMDD-XXXX` (tenant bazlı artan sıra)

### 3.4 Kredi Limiti Servisi (`b2b-credit/`)

**Durum:** Tamamlandı + 8/8 test geçti

| Fonksiyon | Açıklama |
|-----------|----------|
| `setCreditLimit` | Limit tanımla/güncelle (limit, vade, otomatik onay eşiği) |
| `checkCreditAvailability` | Sipariş öncesi yeterlilik kontrolü |
| `reserveCredit` | Sipariş onayında kullanımı rezerve et |
| `releaseCredit` | Ödeme sonrası kullanımı serbest bırak |

**Audit Trail:** Tüm kredi hareketleri (RESERVE, RELEASE, ADJUSTMENT) `CreditLimitHistory`'ye yazılır.

**Otomatik Onay:** `autoApproveUnderLimit` alanı ile belirli bir eşiğin altındaki siparişler admin onayına düşmeden geçer.

### 3.5 Onay İş Akışı Servisi (`b2b-application/`)

**Durum:** Tamamlandı + 6/6 test geçti

| Fonksiyon | Açıklama |
|-----------|----------|
| `createApprovalRequest` | Çok adımlı onay talebi başlat (PENDING) |
| `approveRequest` | Bir sonraki adıma ilerlet veya APPROVED yap |
| `rejectRequest` | Talebi reddet |
| `listPendingApprovals` | Açık talepleri listele |

**Örnek Akış (HIGH_VALUE_ORDER):**

```
Step 1 (manager) → Step 2 (finance) → APPROVED
   |                    |
   └── reject ──────────┘
```

Her adımda `currentStep` artar, son adımda durum `APPROVED` olur.

## 4. Test Sonuçları

| Modül | Test Sayısı | Durum |
|-------|-------------|--------|
| b2b-quote-service | 7 | ✅ 7/7 |
| b2b-credit-limit-service | 8 | ✅ 8/8 |
| b2b-approval-workflow-service | 6 | ✅ 6/6 |
| **Toplam** | **21** | **✅ 21/21** |

## 5. Mimarî Kararlar

### 5.1 Multi-Tenant + Multi-Bayi Güvenlik

```
tenant (Mağaza)
  └── companyAccount (Bayi Firma)
        ├── dealerUser (Bayi Kullanıcısı)
        ├── dealerBranch (Şube)
        ├── creditLimit (Kredi Limiti)
        ├── quotes[] (Teklifler)
        └── dealerOrders[] (Siparişler)
```

Her B2B sorgusu **hem** `tenantId` **hem de** `companyAccountId` filtresi uygular. Tenant admin tüm firmaları görebilir (read-only), bayi kendi firmasıyla sınırlıdır.

### 5.2 Fiyat Öncelik Sıralaması

```
CONTRACT > CUSTOMER_GROUP > VOLUME > LIST
```

Bu sıralama, bayi özel sözleşmenin her zaman en avantajlı olmasını garanti eder.

### 5.3 Decimal(15,4) Standardı

Tüm para alanları (QuoteItem.unitPrice, CreditLimit.limitAmount, DealerOrder.grandTotal vb.) **decimal(15,4)**. Float YASAK. Prisma Decimal'i runtime'da string olarak taşır, kod içinde `@prisma/client/runtime/library`'den import edilen `Decimal` sınıfı kullanılır.

### 5.4 Kredi Limiti İşlem Akışı

```
Sipariş Başlatılır
  ↓
checkCreditAvailability → { approved, availableAmount, autoApproved }
  ↓ (approved ise)
Sipariş Oluşturulur
  ↓
reserveCredit (kullanımı artır)
  ↓
[Ödeme Bekleniyor]
  ↓
Ödeme Geldi
  ↓
releaseCredit (kullanımı azalt)
```

Bu iki aşamalı yapı, kısmi ödemeler ve iade senaryolarında doğru muhasebe sağlar.

### 5.5 Önemli Bug Düzeltmesi (Geliştirme Sırasında)

Prisma enum'ları runtime'da **küçük harfli string** döner (`pending`, `approved`, `rejected`). Service'lerde `OrderApprovalStatus.PENDING` enum import'u **undefined** döndürdüğü için, service'ler literal string sabitleri (`APPROVAL_STATUS.PENDING = 'pending'`) kullanacak şekilde düzeltildi. Bu kritik bir production bug'ıdır ve düzeltilmiştir.

## 6. Bilinen Sınırlamalar / TODO

- **Bayi frontend (Next.js tenant-admin)** Faz 8+ sonrası — admin UI için Faz 9'da
- **Bayi başvuru formu** (DealerApplication için public form) Faz 8+ sonrası
- **e-İmza ile sözleşme** entegrasyonu Faz 9+ sonrası
- **Bayi komisyon yönetimi** Faz 9+ sonrası (SalesRepresentative ile entegre)
- **Hızlı sipariş Excel import** (QuickOrderTemplate için CSV/Excel yükleme) Faz 9+ sonrası
- **Bayi performans raporları** Faz 9+ sonrası
- **Çoklu para birimi desteği** (USD/EUR fiyatlandırma) Faz 9+ sonrası

## 7. Sonuç

Faz 8 başarıyla tamamlanmıştır. B2B kanalının temel yapı taşları (firma yönetimi, fiyatlandırma motoru, teklif → sipariş akışı, kredi limiti, onay iş akışı) hazırdır. 22 yeni Prisma modeli + 21/21 birim testi + 5 servis modülü ile B2B MVP altyapısı tamamlanmıştır.

---

**Hazırlayan:** Mavis (Mavis)
**Tarih:** 2026-07-03
**Toplam eklenen kod:** ~1.600 satır (5 servis + 3 test dosyası + Prisma şema 22 model)
**Yeni B2B model sayısı:** 22
**Geçen birim testleri:** 21/21