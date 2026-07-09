# Faz 10C-Düzeltme — Doğru NES (nes.com.tr) Adaptör

**Tarih:** 2026-07-04
**Durum:** ✅ Tamamlandı
**Kapsam:** Önceki yanlış NES implementasyonunun düzeltilmesi

---

## ❌ Önceki Yanlış Implementasyon

İlk implementasyonda NES'i Logo İşbaşı / Foriba platformu zannedip aşağıdaki hatalı yapıyı kurmuştum:

- ❌ Base URL: `api.nesbilgi.com.tr` (gerçek: `api.nes.com.tr`)
- ❌ Auth: HTTP Basic (gerçek: **OAuth2 Bearer Token**)
- ❌ Payload: UBL XML + SHA-256 (gerçek: **JSON**)
- ❌ `faturaTipi` alanı yanlış isimlendirilmiş

## ✅ Doğru NES (nes.com.tr) Bilgileri

**NES** Türkiye'nin önde gelen GİB onaylı özel entegratör firmalarından biridir:
- Web: https://nes.com.tr
- Portal: https://portal.nes.com.tr
- API: https://api.nes.com.tr (sandbox: api-test.nes.com.tr)
- Auth: OAuth2 `client_credentials` → Bearer token
- 130.000+ işletme kullanıyor

## Yeni NESClient Yeniden Yazımı

| Özellik | Önceki (yanlış) | Doğru NES |
|---------|----------------|-----------|
| Base URL | `api.nesbilgi.com.tr` | `api.nes.com.tr` |
| Auth | HTTP Basic | OAuth2 Bearer |
| Token | Yok | `/oauth/token` (cached, expires_in) |
| Payload format | UBL XML | JSON |
| Endpoint | `/api/v1/invoices` | `/fatura/olustur`, `/fatura/durum/{id}`, `/fatura/iptal`, `/fatura/pdf/{id}` |
| `faturaTipi` | string enum (yanlış) | `SATIS` / `SEVK` / `IADE` / `ISTISNA` / `OZELMATRAH` / `TEVKIFAT` |
| NES durum | `PENDING/SENT/...` | `BEKLEMEDE/GONDERILDI/ONAYLANDI/REDDEDILDI/IPTAL/HATA` |
| Yanıt yapısı | `{ isSuccess, data }` | `{ success, statusCode, data, errorMessage }` |

## NES API Akışı

```bash
# 1. Token al
curl -X POST https://api.nes.com.tr/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "scope": "fatura"
  }'
# → { access_token, token_type: "Bearer", expires_in: 3600 }

# 2. Fatura oluştur
curl -X POST https://api.nes.com.tr/fatura/olustur \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "faturaTipi": "SATIS",
    "belgeNumarasi": "ABC2026000001",
    "duzenlenmeTarihi": "2026-07-04",
    "paraBirimi": "TRY",
    "satici": { "vkn": "...", "unvan": "...", "adres": "..." },
    "alici": { "vkn": "...", "unvan": "...", "adres": "..." },
    "malHizmetList": [
      { "siraNo": 1, "malHizmetAdi": "...", "miktar": 1, "birim": "ADET",
        "birimFiyat": 100, "kdvOrani": 20 }
    ],
    "toplamlar": { "araToplam": 100, "kdvToplam": 20, "odenecekTutar": 120 }
  }'
# → { success: true, data: { faturaId, uuid, durum, pdfBase64? } }

# 3. Durum sorgula
curl -X GET https://api.nes.com.tr/fatura/durum/{faturaId} \
  -H "Authorization: Bearer ..."

# 4. İptal
curl -X POST https://api.nes.com.tr/fatura/iptal \
  -H "Authorization: Bearer ..." \
  -d '{ "faturaId": "...", "iptalSebebi": "...", "iptalTarihi": "..." }'

# 5. PDF indir
curl -X GET https://api.nes.com.tr/fatura/pdf/{faturaId} \
  -H "Authorization: Bearer ..."
```

## Yeni NesClient Özellikleri

- ✅ **OAuth2 Token Cache** — `expires_in` süresince token yeniden alınmaz (5 dk marjla)
- ✅ **JSON Payload** — Türkçe alan isimleriyle NES formatına uygun
- ✅ **AdapterPattern** — `EInvoiceAdapter` interface imzalar, registry'ye kayıt
- ✅ **Durum Mapping** — `BEKLEMEDE → pending`, `GONDERILDI → sent`, vb.
- ✅ **Hata Yönetimi** — Tüm NES hata mesajları Türkçe döner
- ✅ **UBL Builder korundu** — Logo XML adaptörü için hazır (ileride)

## Test Sonuçları

```
UBL Builder:  4/4 ✅
NesClient:    9/9 ✅
─────────────────
TOPLAM:       13/13 ✅
```

**Test kapsamı:**
- ✅ UBL XML üretimi + escape + KDV hesabı + SHA-256 hash
- ✅ Configure (test modu, prod modu, baseUrl override)
- ✅ Configure edilmeden hata fırlatma
- ✅ OAuth2 token alma + cache
- ✅ Bearer header ile istek atma
- ✅ Fatura oluşturma (e-fatura, e-arşiv, e-irsaliye tipleri)
- ✅ Durum sorgulama + iptal + PDF
- ✅ Durum mapping (REDDEDILDI → rejected, ONAYLANDI → accepted, ...)
- ✅ JSON payload doğrulama (satıcı, alıcı, kalemler, toplamlar)

## Tüm Proje Final Test Sonuçları

| Paket | Test | Type |
|-------|------|------|
| commerce-backend | 46/46 ✅ | 0 hata ✅ |
| payment-adapters | 51/51 ✅ | ✅ |
| shipping-adapters | 39/39 ✅ | ✅ |
| storefront | 25/25 ✅ | ✅ |
| einvoice-adapters | **13/13** ✅ | ✅ |
| **TOPLAM** | **174/174** ✅ | **0** ✅ |

Admin UI: **11/11 sayfa HTTP 200** ✅

## `.env.example` Güncellemesi

```bash
# NES GİB onaylı özel entegratördür (nes.com.tr)
NES_API_KEY=your-nes-client-id
NES_API_SECRET=your-nes-client-secret
NES_CUSTOMER_ID=your-nes-mukellef-kodu
NES_TEST_MODE=true
```

## Üretime Geçiş Checklist

NES için gerçek hesap gerekiyor:

1. https://nes.com.tr üzerinden **mükellef kaydı** (e-Fatura başvurusu)
2. **GİB Özel Entegratörlük** tanımı: NES'i kendi entegratörünüz olarak seçin
3. NES Portal → "API Bilgileri" → `Client ID` + `Client Secret` al
4. `.env`'de:
   ```
   NES_API_KEY=...
   NES_API_SECRET=...
   NES_CUSTOMER_ID=...
   NES_TEST_MODE=false
   ```
5. Satıcı bilgilerini (`SELLER_*`) gerçek firma bilgileriyle güncelle

## Mimari Notlar

- **AdapterRegistry** — Diğer sağlayıcılar (Logo XML, Mikro, Foriba) aynı interface'i imzalar
- **UBL Builder** — XML tabanlı adaptörler için ortak builder (NES JSON kullanır, builder'a ihtiyaç yok)
- **OAuth2 Token Cache** — Her istekte token yeniden alınmaz, performans + rate limit dostu
- **Türkçe hata mesajları** — `errorMessage` her zaman Türkçe döner, uluslararası field isimleri yalnızca API protokolünde

---

**Hazırlayan:** Mavis (Mavis)
**Tarih:** 2026-07-04
**Düzeltme:** Yanlış Logo İşbaşı tahmini → Doğru NES (nes.com.tr) implementasyonu
**Toplam NES test:** 13 (UBL 4 + NesClient 9)