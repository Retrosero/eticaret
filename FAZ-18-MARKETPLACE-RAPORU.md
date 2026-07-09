# Faz 18 — Plugin Marketplace

**Tarih:** 2026-07-06
**Süre:** ~4 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Eticart'ı **uzatılabilir** bir platform haline getirmek: her tenant kendi ihtiyacına göre pazaryeri, ödeme, kargo entegrasyonlarını plug-in olarak yükleyebilsin.

---

## 2. Mimari

```
┌────────────────────────────────────────────────────────────────┐
│  Plugin SDK (packages/plugin-sdk)                              │
│                                                                 │
│  PluginRegistry  → load/unload, install/enable/disable        │
│  Manifest        → metadata, slots, hooks                     │
│  Slot System     → payment.gateway, shipping.carrier,         │
│                    marketplace.adapter, ...                    │
│  Hook System     → order.created, product.updated, ...       │
└────────────────────┬───────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬─────────────┐
        ▼            ▼            ▼             ▼
   Trendyol      Hepsiburada    N11          (gelecek)
   plugin        plugin         plugin       (Shopify, Etsy, vb.)
        │            │            │
        └────────────┴────────────┴────────────────────┐
                                                        │
   ┌────────────────────────────────────────────────────┘
   │
   ▼
┌────────────────────────────────────────────────────────────────┐
│  commerce-backend (Plugin Marketplace API)                    │
│  /api/marketplace/*                                            │
│                                                                 │
│  GET    /plugins           → Marketplace listesi             │
│  GET    /plugins/:code     → Plugin detayı                   │
│  GET    /installed         → Tenant için yüklü plugin'ler    │
│  POST   /install           → Yeni plugin yükle                │
│  POST   /installed/:code/configure → Config güncelle          │
│  POST   /installed/:code/enable    → Etkinleştir             │
│  POST   /installed/:code/disable   → Devre dışı              │
│  DELETE /installed/:code            → Kaldır                   │
│  POST   /installed/:code/test       → Test bağlantısı         │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Plugin SDK

### 3.1 Manifest Standardı

Her plugin bir `PluginManifest` export eder:

```typescript
{
  code: 'eticart-plugin-trendyol',
  name: 'Trendyol Pazaryeri',
  description: '...',
  category: 'marketplace',     // marketplace | payment | shipping | ...
  version: '1.0.0',
  author: 'EtiCart',
  license: 'MIT',
  eticartVersion: '1.0.0',
  slug: 'trendyol',
  pricing: { monthlyKurus: 49900, yearlyKurus: 499000, hasTrial: true },
  slots: [
    { type: 'marketplace.adapter', handler: 'adapter' },
  ],
  hooks: [
    { event: 'product.created', handler: 'onProductCreated' },
  ],
  configSchema: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
  ],
}
```

### 3.2 Slot Tipleri

| Slot | Açıklama |
|------|----------|
| `payment.gateway` | Ödeme gateway'i (iyzico, PayTR, Stripe, ...) |
| `shipping.carrier` | Kargo firması (Yurtiçi, Aras, MNG, ...) |
| `marketplace.adapter` | Pazaryeri adaptörü (Trendyol, Hepsiburada, ...) |
| `notification.channel` | Bildirim kanalı (SMS, push) |
| `admin.page` | Admin sayfası |
| `storefront.page` | Storefront sayfası |
| `api.endpoint` | API endpoint |
| `webhook.receiver` | Webhook receiver |

### 3.3 Hook Sistemi

Plugin'ler Eticart'taki event'lere subscribe olabilir:

```typescript
hooks: [
  { event: 'product.created', handler: 'onProductCreated', priority: 100 },
  { event: 'product.updated', handler: 'onProductUpdated', priority: 100 },
  { event: 'order.shipped', handler: 'onOrderShipped', priority: 100 },
]
```

Hook handler'lar:
- `HookEvent<T>` alır (event, tenantId, data, timestamp)
- `HookResult` döner (`{ continue, data?, error? }`)
- Tenant için disable edilmişse otomatik atlanır
- Hata durumunda graceful degradation (diğer handler'lar devam)

### 3.4 Multi-Tenant Install

```typescript
registry.install(tenantId, pluginCode, config)  // Yükle
registry.enable(tenantId, pluginCode)           // Etkinleştir
registry.disable(tenantId, pluginCode)          // Devre dışı
registry.uninstall(tenantId, pluginCode)        // Kaldır
```

Her tenant bağımsız config + enabled/disabled state.

---

## 4. Pazaryeri Plugin'leri

### 4.1 Trendyol (`@eticart/marketplace-trendyol`)

| Slot | Handler | Priority |
|------|---------|----------|
| marketplace.adapter | `adapter` | 10 |

**Hook'lar:**
- `product.created` → `onProductCreated` (push ürün)
- `product.updated` → `onProductUpdated` (stok/fiyat)
- `order.shipped` → `onOrderShipped` (kargo bildir)

**API:** `https://api.trendyol.com/sapigw` (Basic Auth)

**Config:**
- apiKey, apiSecret, sellerId, merchantId, env (production/staging)

### 4.2 Hepsiburada (`@eticart/marketplace-hepsiburada`)

Aynı yapı, farklı API endpoint ve kimlik doğrulama.

### 4.3 N11 (`@eticart/marketplace-n11`)

Aynı yapı, appKey/appSecret header-based auth.

### 4.4 Adaptör Interface

```typescript
interface MarketplaceAdapterPlugin {
  manifest: PluginManifest;
  testConnection(ctx): Promise<{ success, sellerId?, message }>;
  pushProduct(input, ctx): Promise<{ platformProductId, url }>;
  updateStock(input, ctx): Promise<void>;
  updatePrice(input, ctx): Promise<void>;
  fetchOrders(ctx): Promise<Order[]>;
  updateShipment(input, ctx): Promise<void>;
}
```

---

## 5. Plugin Marketplace API

### 5.1 Listeleme

```http
GET /api/marketplace/plugins
Authorization: Bearer <token>

→ 200 OK
[
  {
    "code": "eticart-plugin-trendyol",
    "name": "Trendyol Pazaryeri",
    "description": "...",
    "category": "marketplace",
    "version": "1.0.0",
    "pricing": { "monthlyKurus": 49900, "yearlyKurus": 499000, "hasTrial": true },
    "slots": [{ "type": "marketplace.adapter" }],
    "tags": ["pazaryeri", "trendyol"]
  }
]
```

### 5.2 Install

```http
POST /api/marketplace/install
{
  "code": "eticart-plugin-trendyol",
  "config": {
    "apiKey": "...",
    "apiSecret": "...",
    "sellerId": "..."
  }
}

→ 201 Created
{ "ok": true, "code": "eticart-plugin-trendyol", "enabled": true }
```

**Validation:** configSchema'daki required alanlar kontrol edilir.

### 5.3 Test Connection

```http
POST /api/marketplace/installed/eticart-plugin-trendyol/test

→ 200 OK
{ "success": true, "message": "Trendyol bağlantısı başarılı." }
```

### 5.4 Config Update

```http
POST /api/marketplace/installed/eticart-plugin-trendyol/configure
{
  "config": { "apiKey": "new-key" }
}

→ 200 OK
{
  "ok": true,
  "code": "eticart-plugin-trendyol",
  "config": { "apiKey": "••••••••", "apiSecret": "••••••••" }  // masked
}
```

---

## 6. Plugin Marketplace UI

**`apps/tenant-admin/src/app/marketplace/page.tsx` + `MarketplaceClient.tsx`**

**Özellikler:**
- Kategori filtresi (Tümü, Pazaryeri, Ödeme, Kargo, ...)
- Arama
- Plugin kartları (logo, ad, açıklama, tags, fiyat)
- Install / Enable / Disable / Uninstall butonları
- Yüklü olanlar "Aktif" / "Pasif" badge ile
- Trial bilgisi ("14 gün ücretsiz")
- Loading state

**Server component (initial load) + client component (interactions)**

---

## 7. Mimari Kararlar

### 7.1 In-Memory Registry (Phase 18)
- Per-process plugin listesi
- Production'da DB'den yüklenir (migration)
- Multi-instance deployment'ta shared cache (Redis) gerekebilir

### 7.2 Plugin SDK Ayrı Paket
- `@eticart/plugin-sdk` — tip tanımları + registry
- Plugin geliştiriciler sadece bu paketi import eder
- Host (commerce-backend) tüm plugin'leri yükler

### 7.3 Hook Callback vs Slot
- **Slot**: Tek bir noktaya birden çok plugin bağlanabilir (ör. payment.gateway)
- **Hook**: Event olduğunda tüm subscriber'lar sırayla çalışır (ör. product.created)

### 7.4 Graceful Degradation
- Hook hatası → log + diğer handler'lar devam
- Plugin hatası → uygulama çökmez
- `continue: false` → zincir kırılır

### 7.5 Config Maskeleme
- `password`, `secret`, `apiKey` alanları response'ta `••••••••` olarak döner
- DB'de plain text (encryption Faz 19)

### 7.6 Vanilla fetch (axios yerine)
- Node 18+ global fetch
- Daha az dependency
- Daha iyi TypeScript desteği

---

## 8. Test Sonuçları

### Yeni Testler (33)

| Test | Sayı | Sonuç |
|------|------|-------|
| `plugin-sdk/registry.test.ts` | 19 | ✅ |
| `commerce-backend/plugins/plugin.service.test.ts` | 14 | ✅ |
| **Sprint 18 yeni** | **33** | **✅** |

**Plugin Registry (19 test):**
- load/unload, manifest validation (code, version, slots)
- install/enable/disable/uninstall
- listForTenant (enabledOnly)
- getSlotHandlers (priority sırası)
- emitHook (tenant izolasyon, disabled skip, continue:false, hata yakalama)
- Multi-tenant isolation
- globalRegistry singleton

**Plugin Service (14 test):**
- listMarketplace, getMarketplacePlugin
- install (z success, eksik config validation, olmayan plugin)
- configure, enable, disable, uninstall
- listInstalled (password maskeleme)
- testConnection (adapter call)

### Tüm Proje Test Özeti

| Paket | Test | Sonuç |
|------|------|-------|
| commerce-backend | **167** | ✅ (+14) |
| **plugin-sdk** | **19** (yeni) | **✅** |
| control-plane | 63 | ✅ |
| storefront | 59 | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **480+** ✅ | **+33 yeni** |

---

## 9. Dosya Yapısı (Faz 18)

```
packages/
├── plugin-sdk/                                  # 🆕 SDK paketi
│   ├── src/
│   │   ├── types.ts                             # 🆕 Manifest, slot, hook types
│   │   ├── registry.ts                          # 🆕 PluginRegistry class
│   │   └── index.ts                             # 🆕 Public exports
│   └── __tests__/
│       └── registry.test.ts                     # 🆕 19 test
│
├── marketplace-trendyol/                        # 🆕 Trendyol plugin
│   ├── src/index.ts                             # 🆕 10 KB
│   ├── package.json
│   └── tsconfig.json
│
├── marketplace-hepsiburada/                     # 🆕 Hepsiburada plugin
│   ├── src/index.ts                             # 🆕 9 KB
│   ├── package.json
│   └── tsconfig.json
│
└── marketplace-n11/                             # 🆕 N11 plugin
    ├── src/index.ts                             # 🆕 8 KB
    ├── package.json
    └── tsconfig.json

apps/commerce-backend/src/modules/plugins/       # 🆕 Plugin marketplace API
├── plugin.controller.ts                         # 9 endpoint
├── plugin.service.ts                            # Marketplace, install, config
├── plugin.module.ts
└── __tests__/plugin.service.test.ts             # 14 test

apps/tenant-admin/src/app/marketplace/           # 🆕 Marketplace UI
├── page.tsx                                     # Server component
└── MarketplaceClient.tsx                        # Client component
```

---

## 10. Production Checklist

- [ ] `plugin-sdk` tüm paketlerde aynı versiyon
- [ ] Pazaryeri plugin'leri env-driven (production/staging)
- [ ] Her plugin için API rate limit
- [ ] Plugin update mekanizması (version check)
- [ ] Plugin sandboxing (CPU/memory limit)
- [ ] Plugin metrics (call count, error rate)
- [ ] Plugin deprecation policy

---

## 11. Sprint 19+ Önerileri

| Sprint | İçerik | Süre |
|--------|--------|------|
| **19** | White-label (özel domain, tema, encryption-at-rest) | 5-7 gün |
| **20** | Analytics & reporting dashboard | 5 gün |
| **21** | Help center / ticket sistemi | 3-5 gün |
| **22** | Super admin SSO + RBAC | 3 gün |
| **23** | Plugin sandboxing + versioning | 5 gün |
| **24** | SMS / push notification plugin'leri | 3 gün |

---

*Son güncelleme: 2026-07-06 — Faz 18 Marketplace*
*Toplam: 41+ Faz, 480+ test*