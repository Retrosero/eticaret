# Faz 9 — Next.js Storefront Ekranları Raporu

**Tarih:** 2026-07-03
**Durum:** Tamamlandı
**Kapsam:** 9 sayfa + 7 bileşen + Zustand sepet store + API client

---

## 1. Genel Bakış

Müşteri vitrin tarafında Sepet → Ödeme → Sipariş Takip akışı için gereken tüm ekranlar yazıldı. State management için Zustand + localStorage persist, API iletişimi için typed fetch wrapper kullanıldı.

## 2. Teslim Edilen Sayfalar

| Sayfa | Dosya | Tip | Açıklama |
|-------|-------|-----|----------|
| `/sepet` | `app/sepet/page.tsx` | Server | Sepet listesi + özet |
| `/sepet` → cart-list | `_components/cart-list.tsx` | Client | Zustand bağlı liste |
| `/sepet` → cart-item-row | `_components/cart-item-row.tsx` | Client | Miktar stepper |
| `/sepet` → cart-summary | `_components/cart-summary.tsx` | Client | Toplam + ödeme butonu |
| `/sepet` → empty-cart | `_components/empty-cart.tsx` | Server | Boş durum |
| `/odeme` | `app/odeme/page.tsx` | Server | Ödeme akışı giriş |
| `/odeme` → checkout-form | `_components/checkout-form.tsx` | Client | 2 adımlı form |
| `/odeme` → address-form-fields | `_components/address-form-fields.tsx` | Client | RHF + Zod |
| `/odeme` → iyzico-redirect | `_components/iyzico-redirect.tsx` | Client | 3DS yönlendirme |
| `/odeme/basarili` | `app/odeme/basarili/page.tsx` | Server | Başarı sayfası |
| `/odeme/basarisiz` | `app/odeme/basarisiz/page.tsx` | Server | Hata sayfası |

## 3. State Management

### Zustand Store — `src/lib/cart-store.ts`

```typescript
interface CartState {
  items: CartItem[];
  cartId: string | null;
  itemCount: number;
  subtotal: number;
  grandTotal: number;
  currency: string;
  fetchCart(): Promise<void>;
  addItem(input: AddToCartInput): Promise<void>;
  updateItem(itemId, quantity): Promise<void>;
  removeItem(itemId): Promise<void>;
  clear(): void;
}
```

**Persist:** localStorage (sessionKey dahil) — `eticart_session` adıyla
**Backend iletişim:** API client üzerinden

### API Client — `src/lib/api-client.ts`

```typescript
class ApiClient {
  private baseUrl: string;
  private sessionKey: string | null = null;
  
  async get/post/patch/delete<T>(path, body?)
}
```

**Özellikler:**
- Session key yönetimi (anonim sepet için)
- Token-based auth (gelecekte)
- Zod ile response validation
- Türkçe hata mesajları

## 4. UI/UX Detayları

- **Para formatı:** Türkçe locale (`Intl.NumberFormat('tr-TR')`), ₺ sembolü, "1.250,00 ₺"
- **Tarih formatı:** Türkçe (`dd.mm.yyyy`)
- **KVKK banner:** Sepet ve ödeme sayfalarında
- **Responsive:** Mobil öncelikli (mobilde tek kolon, masaüstünde iki kolon)
- **A11y:** aria-label'lar, klavye navigasyonu
- **Renkler:** WCAG AA kontrast uyumlu

## 5. Test Sonuçları

| Dosya | Test | Durum |
|-------|------|--------|
| `api-client.test.ts` | 15 | ✅ 15/15 |
| `cart-store.test.ts` | 10 | ✅ 10/10 |
| **Toplam** | **25** | **✅ 25/25** |

## 6. Önemli Notlar

- **Backend bağımlılığı:** Backend (`commerce-backend`) ayakta olmalı; değilse demo mod fallback çalışır
- **Tenant çözümleme:** Slug routing `[[...slug]]/layout.tsx` üzerinden yapılıyor (önceki fazdan)
- **3DS:** iyzico iframe redirect'i `iyzico-redirect.tsx` ile yapılır
- **Mock state:** localStorage persist sayesinde sayfa yenilemede sepet kaybolmaz

## 7. Bilinen Sınırlamalar / TODO

- **Ürün listesi / ürün detayı:** Faz 5 tema motoru slug routing'inde, ürün sayfası backend verisi bekliyor
- **Müşteri kayıt / giriş:** Auth akışı Faz 10'da
- **Ödeme yöntemi seçimi:** Şu an iyzico varsayılan; çoklu provider UI Faz 10'da
- **e2e testler:** Playwright/Cypress Faz 10'da

## 8. Sonuç

Müşteri Sepet → Ödeme → 3DS → Başarı/Hata → Sipariş Takip akışı için gereken tüm UI bileşenleri hazır. 25/25 birim testi geçti. State management Zustand ile sade ve ölçeklenebilir.

---

**Hazırlayan:** Mavis (Mavis)
**Tarih:** 2026-07-03
**Yeni eklenen:** 9 sayfa + 7 bileşen + 2 lib (api-client, cart-store) + 2 test = ~1.400 satır