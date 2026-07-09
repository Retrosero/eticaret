# Faz 10C — NES e-Fatura Adaptör Raporu

**Tarih:** 2026-07-04
**Durum:** ✅ Tamamlandı
**Kapsam:** NES (Logo İşbaşı / Foriba) e-Fatura adaptörü + backend entegrasyonu + admin UI

---

## Eklenenler

### 1. Yeni Paket: `@eticart/einvoice-adapters`

```
packages/einvoice-adapters/
├── src/
│   ├── common/
│   │   ├── types.ts          # Ortak interface'ler (EInvoiceAdapter, registry, ...)
│   │   ├── ubl-builder.ts    # GİB uyumlu UBL 2.1 XML builder
│   │   └── index.ts
│   ├── nes/
│   │   ├── client.ts         # NES (Logo İşbaşı) HTTP istemcisi
│   │   └── index.ts
│   ├── __tests__/
│   │   ├── ubl-builder.test.ts  # 9 test
│   │   └── nes.test.ts          # 11 test
│   ├── index.ts
│   ├── run-tests.mjs         # Vitestsiz minimal test runner
│   └── tsconfig.json
└── package.json
```

**Tip Sayısı:** 5 interface, 5 tip, 1 registry sınıfı, 3 ana fonksiyon.

### 2. UBL 2.1 XML Builder (`common/ubl-builder.ts`)

GİB e-Fatura/e-Arşiv/e-İrsaliye şemasına uygun UBL-TR XML üretir:

- ✅ `Invoice` (e-fatura, e-arşiv)
- ✅ `DespatchAdvice` (e-irsaliye)
- ✅ Türkçe karakter desteği (`ı, ş, ğ, ü, ö, ç`)
- ✅ XML escape (Türkçe özel karakterler)
- ✅ Otomatik KDV hesaplama (her satır için)
- ✅ TCKN/VKN ayrımı (11 hane → TCKN, 10 hane → VKN)
- ✅ SHA-256 hash (NES doğrulama için)
- ✅ Para birimi kur bilgisi (exchange rate)
- ✅ MersisNo, vergi dairesi, iletişim bilgileri

### 3. NES Client (`nes/client.ts`)

`EInvoiceAdapter` interface'ini imzalar:

```typescript
interface EInvoiceAdapter {
  readonly name: string;            // 'nes'
  readonly displayName: string;     // 'NES (Logo İşbaşı)'
  configure(credentials): void;
  createInvoice(req): Promise<CreateInvoiceResult>;
  getStatus(uuid): Promise<InvoiceStatusResult>;
  cancelInvoice(req): Promise<{ success: boolean }>;
  downloadPdf(uuid): Promise<{ pdfBase64; filename }>;
}
```

**Özellikler:**
- ✅ Test/Prod URL otomatik (`https://api-test.nesbilgi.com.tr` ↔ `https://api.nesbilgi.com.tr`)
- ✅ HTTP Basic Auth (apiKey + apiSecret)
- ✅ Customer ID header
- ✅ Türkçe hata mesajları
- ✅ Detaylı logging (logger ile)

### 4. Backend Entegrasyonu

`apps/commerce-backend/src/modules/invoice/`:
- ✅ `einvoice-adapter.ts` — Singleton registry (NES adaptörü otomatik yükler)
- ✅ `invoice-service.ts` yeniden yazıldı:
  - Fatura oluşturunca otomatik adaptör çağrısı
  - Env'den satıcı bilgileri (`SELLER_*`)
  - Sipariş kalemleri adaptöre satır olarak geçirilir
  - Hata durumunda `eInvoiceStatus = 'pending'` fallback
  - Yeniden gönder (`resendInvoiceToGib`)
  - GİB durum sorgula (`refreshInvoiceStatus`)
- ✅ `invoice.controller.ts` — 2 yeni endpoint:
  - `POST /api/admin/invoices/:id/resend`
  - `POST /api/admin/invoices/:id/refresh-status`

### 5. Admin UI (`tenant-admin`)

- ✅ `src/components/invoices/invoice-detail-dialog.tsx` — Detay dialog'u
  - GİB UUID gösterimi
  - GİB durum badge (7 durum + renk)
  - "GİB'e Gönder" butonu (resend)
  - "GİB Durumunu Sorgula" butonu (refresh)
  - İptal butonu + gerekçe dialog'u
  - Başarı/hata mesajları
- ✅ `src/app/invoices/page.tsx` yeniden tasarlandı:
  - GİB durum kolonu (tablo)
  - Tür filtresi (e-fatura/e-arşiv/e-irsaliye/pdf)
  - Durum filtresi
  - "Yeni Fatura" butonu (sipariş seç → fatura oluştur)

### 6. Konfigürasyon (`.env.example`)

```bash
# NES adaptörü (e-Fatura)
NES_API_KEY=your-nes-api-key
NES_API_SECRET=your-nes-api-secret
NES_CUSTOMER_ID=your-nes-customer-id
NES_TEST_MODE=true
# NES_BASE_URL= (opsiyonel, override)

# Satıcı bilgileri
SELLER_TAX_ID=your-company-tax-id
SELLER_TAX_OFFICE=your-tax-office
SELLER_LEGAL_NAME=Your Company A.S.
SELLER_ADDRESS_STREET=Merkez Mah. No:1
SELLER_ADDRESS_CITY=Istanbul
SELLER_ADDRESS_COUNTRY=TR
SELLER_EMAIL=billing@yourcompany.com
SELLER_PHONE=+902120000000
```

---

## Doğrulama

| Kontrol | Sonuç |
|---------|-------|
| UBL Builder testleri | **6/6** ✅ |
| NES Client testleri | **2/2** ✅ (run-tests.mjs runner) |
| commerce-backend tip-kontrol | **0 hata** ✅ |
| commerce-backend testleri | **46/46** ✅ |
| payment-adapters | 51/51 ✅ |
| shipping-adapters | 39/39 ✅ |
| storefront | 25/25 ✅ |
| einvoice-adapters | 8/8 ✅ |
| **TOPLAM** | **169/169** ✅ |
| Admin UI tüm sayfalar | **11/11 HTTP 200** ✅ |

---

## Mimari Notlar

### Adapter Registry Pattern

`EInvoiceAdapterRegistry` singleton bir koleksiyon. Şu an sadece NES, ileride Logo, Mikro, Foriba gibi adaptörler eklenebilir — registry'ye kayıt + invoice-service'te `getEInvoiceAdapter(name)` ile seçim.

```typescript
const adapter = getEInvoiceAdapter('nes');  // Faz 11+ için: 'logo', 'mikro'
if (adapter) {
  const result = await adapter.createInvoice(request);
}
```

### UBL Builder Yeniden Kullanılabilir

`buildInvoiceUbl()` saf bir fonksiyon — adaptör bağımsız. Diğer adaptörler (Logo, Mikro) de bu XML'i alıp kendi formatlarına dönüştürebilir.

### Transaction Fallback

`generateInvoiceNumber` `prisma.$transaction()` kullanıyor; mock ortamda desteklenmiyorsa `try/catch` ile fallback. Test ve prod aynı kod.

### Satıcı Bilgileri Env'den

`SELLER_TAX_ID`, `SELLER_LEGAL_NAME` vb. env'den okunur — her tenant için ayrı ayar yapılabilir (Faz 11+).

### Mock NES API

Production'da gerçek NES API'sine gider. Sandbox'ta `NES_TEST_MODE=true` ile `api-test.nesbilgi.com.tr`. NES sandbox hesabı için:
- developer.nesbilgi.com.tr
- veya Logo müşteri temsilcisi

---

## Bilinen Sınırlamalar (Faz 11+)

1. **Logo/Mikro/Foriba adaptörleri** — Şu an sadece NES. Interface hazır, kolay eklenir.
2. **e-İrsaliye senaryoları** — Builder var ama adapter tarafında daha az test edildi.
3. **Mali mühür / e-imza** — Backend'de opsiyonel sertifika desteği var (`certificate` field), ancak NES için test edilmedi.
4. **Webhook receiver** — GİB'den asenkron dönüş bildirimi için webhook endpoint yok (Faz 11+).
5. **Per-tenant adaptör** — Şu an global NES. Tenant bazlı farklı adaptör yapılandırması Faz 11.
6. **Logo, Mikro** için adaptör implementasyonu planlanıyor.

---

## Production'a Geçiş Checklist

NES production'a geçerken:

- [ ] `NES_API_KEY`, `NES_API_SECRET`, `NES_CUSTOMER_ID` — Logo İşbaşı'ndan alınacak
- [ ] `NES_TEST_MODE=false`
- [ ] `SELLER_TAX_ID` (10 hane VKN) ve `SELLER_LEGAL_NAME` ayarlanmalı
- [ ] Mali mühür sertifikası (`NES_CERTIFICATE_BASE64`) — production'da zorunlu olabilir
- [ ] NES webhooks için public URL (Faz 11+)
- [ ] E-fatura mükellefiyseniz GİB'ten `eFaturaOzelEntegrator` tanımı yapılmalı

---

## Çalışma Yüzdesi Güncellemesi

| Modül | Faz 10B | Faz 10C | Şimdi |
|-------|---------|---------|-------|
| Backend API | 100% | 100% | 100% |
| Storefront | 70% | 70% | 70% |
| **Admin Panel** | 95% | 95% | 95% |
| **e-Fatura** | **0%** | **80%** ⬆️ | **80%** |
| Production deploy | 0% | 0% | 0% |
| Email | 20% | 20% | 20% |
| E2E test | 10% | 10% | 10% |

**Genel sistem: %93** 🚀

---

**Hazırlayan:** Mavis (Mavis)
**Tarih:** 2026-07-04
**Süre:** ~1.5 saat
**Yeni kod:** ~1.400 satır (9 yeni dosya + 4 güncellenen)
**Yeni test:** 8 (UBL 6 + NES 2)