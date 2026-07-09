# Faz 24 — Mobile App (React Native + Expo)

**Tarih:** 2026-07-07
**Süre:** ~5 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Mağaza sahiplerinin **mobil uygulama** ile siparişlerini takip edebileceği, ürün yönetebileceği, gerçek zamanlı bildirim alabileceği bir platform:

- ✅ Native iOS + Android (Expo ile cross-platform)
- ✅ Login + 2FA + Biometric (Face ID / Touch ID / Parmak İzi)
- ✅ Dashboard (günlük/aylık ciro, bekleyen siparişler, düşük stok)
- ✅ Sipariş yönetimi (liste, detay, durum güncelleme)
- ✅ Ürün yönetimi (liste, stok güncelleme)
- ✅ Push notifications (sipariş, düşük stok)
- ✅ Offline-first (AsyncStorage queue + auto-flush)
- ✅ TanStack Query (cache + background refetch)

---

## 2. Mimari

```
┌──────────────────────────────────────────────────────────────┐
│  Mobile App (apps/mobile/)                                    │
│                                                               │
│  Expo Router (typed routes)                                   │
│  ├── (auth)/login          → Email/password + 2FA + biometric│
│  ├── (tabs)/               → Stack navigation                 │
│  │   ├── index             → Dashboard (KPI cards)            │
│  │   ├── orders            → Sipariş listesi (status filtresi)│
│  │   ├── products          → Ürün listesi (lowStock filtresi)│
│  │   └── settings          → Profil + push toggle + logout    │
│  └── orders/[id]           → Sipariş detayı + status advance  │
│                                                               │
│  State                                                         │
│  ├── Zustand (auth, offline queue)                            │
│  ├── TanStack Query (server cache)                            │
│  └── AsyncStorage (offline actions)                            │
│                                                               │
│  Native                                                        │
│  ├── expo-secure-store (Keychain/EncryptedSharedPrefs)         │
│  ├── expo-notifications (push tokens)                          │
│  ├── expo-local-authentication (Face ID / Touch ID)            │
│  ├── expo-haptics (taptic feedback)                            │
│  └── NetInfo (offline detection)                               │
└──────────────────────────────────────────────────────────────┘
                          ↕ REST API (Axios + interceptor)
┌──────────────────────────────────────────────────────────────┐
│  commerce-backend (modules/mobile/)                            │
│  MobileService                                                 │
│  ├── getDashboard()          → 6 paralel query                 │
│  ├── listOrders/getDetail    → Mobil-optimized response        │
│  ├── updateOrderStatus()     → Offline queue uyumlu           │
│  ├── listProducts/updateStock→ Stok güncelleme                 │
│  ├── registerPushToken()     → Expo push token sakla           │
│  ├── sendPushToTenant()      → Expo Push API'ye POST           │
│  ├── notifyOrderCreated()    → Yeni sipariş bildirimi          │
│  └── notifyLowStock()        → Düşük stok uyarısı              │
└──────────────────────────────────────────────────────────────┘
                          ↕ pg.Pool
                    PostgreSQL: mobile_push_tokens
```

---

## 3. Sayfa Yapısı

### 3.1 Auth Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Login Screen (app/(auth)/login.tsx)                        │
│                                                              │
│  ┌──────────────────────────────────────┐                    │
│  │            EtiCart                   │                    │
│  │      Mağaza Yönetimi                 │                    │
│  │                                      │                    │
│  │  [E-posta________________]            │                    │
│  │  [Şifre___________________]           │                    │
│  │                                      │                    │
│  │  [    Giriş Yap    ]                 │                    │
│  │                                      │                    │
│  │  👆 Biyometrik ile giriş              │                    │
│  └──────────────────────────────────────┘                    │
│                                                              │
│  ↓ 2FA gerekirse:                                            │
│  ┌──────────────────────────────────────┐                    │
│  │  [2FA Kodu (6 haneli)________]       │                    │
│  │  [        Doğrula          ]         │                    │
│  └──────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Tab Navigation

```
┌──────────────────────────────────────────────────────────────┐
│  Tab Bar (4 sekme)                                            │
│  [Dashboard] [Siparişler] [Ürünler] [Ayarlar]                  │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Dashboard (app/(tabs)/index.tsx)

```
┌──────────────────────────────────────────────────────────────┐
│  Bugün                                                       │
│  ┌─────────────┐  ┌─────────────┐                            │
│  │ Ciro        │  │ Sipariş     │                            │
│  │ ₺12,450     │  │ 23          │                            │
│  └─────────────┘  └─────────────┘                            │
│  ┌─────────────┐  ┌─────────────┐                            │
│  │ Müşteri     │  │ Dün. Değişim│                            │
│  │ 18          │  │ ↑ 12.5%     │                            │
│  └─────────────┘  └─────────────┘                            │
│                                                              │
│  Bu Ay                                                        │
│  ┌─────────────┐  ┌─────────────┐                            │
│  │ Aylık Ciro  │  │ Aylık Sipariş│                            │
│  │ ₺245,300    │  │ 412         │                            │
│  └─────────────┘  └─────────────┘                            │
│                                                              │
│  Bekleyen İşlemler                                            │
│  ┌─────────────┐  ┌─────────────┐                            │
│  │ Bekleyen     │  │ Düşük Stok  │                            │
│  │ Sipariş: 7   │  │ 4 ürün      │                            │
│  └─────────────┘  └─────────────┘                            │
│                                                              │
│  Son Siparişler                                                │
│  #ORD-001 · Ahmet Y.    ₺450.00  pending                    │
│  #ORD-002 · Ayşe D.    ₺1,200   confirmed                  │
└──────────────────────────────────────────────────────────────┘
```

### 3.4 Sipariş Detayı (app/orders/[id].tsx)

```
┌──────────────────────────────────────────────────────────────┐
│  #ORD-001                                                     │
│  07.07.2026 10:45                                             │
│                                                              │
│  ┌─ Müşteri ──────────────────────────┐                      │
│  │  Ahmet Yılmaz                       │                      │
│  │  +90 555 123 45 67                  │                      │
│  │  Kadıköy, İstanbul                  │                      │
│  └─────────────────────────────────────┘                      │
│                                                              │
│  ┌─ Ürünler (3) ─────────────────────┐                      │
│  │  Ürün A          2x    ₺100       │                      │
│  │  Ürün B          1x    ₺150       │                      │
│  │  Ürün C          3x    ₺200       │                      │
│  │  ─────────────────────────────     │                      │
│  │  Toplam                ₺450       │                      │
│  └─────────────────────────────────────┘                      │
│                                                              │
│  ┌─ Durum ───────────────────────────┐                       │
│  │  [Bekliyor]                       │                       │
│  │  [Not (opsiyonel)_______________]  │                       │
│  │  [    → Onaylandı    ]            │                       │
│  └─────────────────────────────────────┘                      │
│                                                              │
│  📡 Çevrimdışı — değişiklikler kuyruğa eklendi               │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. State Management

### 4.1 Zustand Auth Store

```typescript
const useAuthStore = create<AuthState>((set) => ({
  status: 'idle' | 'authenticating' | 'authenticated' | 'unauthenticated',
  user: { id, email, fullName, role, twoFactorEnabled },
  tenant: { id, slug, name, apiUrl },
  requires2FA: boolean,
  biometricEnabled: boolean,
  
  async login(email, password, twoFactorCode) {
    // API call → token + tenant → save to SecureStore
    set({ status: 'authenticated', user, tenant });
  },
  
  async logout() {
    await api.logout();
    set({ status: 'unauthenticated', user: null });
  },
}));
```

### 4.2 Offline Queue Store

```typescript
const useOfflineQueueStore = create<OfflineQueueState>((set, get) => ({
  queue: QueuedAction[],
  online: boolean,
  
  async enqueue(action) {
    const next = [...queue, action].slice(-500);  // Max 500
    set({ queue: next });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  },
  
  async flush() {
    // Her aksiyonu sırayla dene (PUSH), başarısızları tut
    let flushed = 0, failed = 0;
    for (const action of queue) {
      try {
        await fetch(`/api/...`, { method, body });
        flushed++;
      } catch {
        remaining.push(action);
        failed++;
      }
    }
    set({ queue: remaining });
  },
}));
```

---

## 5. Push Notifications

### 5.1 Kayıt Akışı

```
Mobile (Settings tab)
  ↓ togglePush(true)
  ↓
Notifications.requestPermissionsAsync()
  ↓ granted
  ↓
Notifications.getExpoPushTokenAsync() → ExponentPushToken[...]
  ↓
POST /api/mobile/push/register { token, platform }
  ↓
DB: mobile_push_tokens INSERT (upsert)
  ↓
artık push alabilir
```

### 5.2 Gönderim Akışı

```
Yeni sipariş oluştu (backend)
  ↓
MobileService.notifyOrderCreated(tenantId, orderId, orderNumber)
  ↓
Tenant'ın tüm aktif push token'larını çek (son 90 gün)
  ↓
Expo Push API'ye POST: https://exp.host/--/api/v2/push/send
  ↓
{ to: [t1, t2, t3], title: '🛒 Yeni Sipariş', body: '...' }
  ↓
Apple/Google push'a ilet
  ↓
Mobile cihazda bildirim görünür
```

### 5.3 Bildirim Tipleri

| Event | Title | Body | Data |
|-------|-------|------|------|
| `order.created` | 🛒 Yeni Sipariş | `#ORD-001 numaralı sipariş alındı` | `{ orderId }` |
| `order.status_changed` | 📦 Sipariş Güncellendi | `ORD-001 kargoya verildi` | `{ orderId }` |
| `product.low_stock` | ⚠️ Düşük Stok | `Ürün X: 2 adet kaldı` | `{ productId }` |
| `support.ticket.replied` | 💬 Destek Yanıtı | `Talebinize yanıt geldi` | `{ ticketId }` |

---

## 6. API Endpoint'leri (Mobile)

### Dashboard & Orders

```http
GET   /api/mobile/dashboard
  → { today, yesterday, monthToDate, pendingOrders, lowStockProducts, recentOrders }

GET   /api/mobile/orders?status=pending&limit=50
  → [{ id, orderNumber, customerName, total, status, itemCount, createdAt }]

GET   /api/mobile/orders/:id
  → Sipariş detayı + items array

PATCH /api/mobile/orders/:id/status
  Body: { status: 'shipped', note: 'Kargo: Y12345' }
  → { ok: true }
```

### Products

```http
GET   /api/mobile/products?lowStock=true
  → [{ id, name, sku, stock, price, status }]

PATCH /api/mobile/products/:id/stock
  Body: { stock: 50 }
  → { ok: true }
```

### Push

```http
POST  /api/mobile/push/register
  Body: { token: 'ExponentPushToken[...]', platform: 'ios' }
  → { ok: true }

POST  /api/mobile/push/unregister
  Body: { token: '...' }
  → { ok: true }
```

---

## 7. Veritabanı

```sql
CREATE TABLE public.mobile_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
  token VARCHAR(200) UNIQUE NOT NULL,
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, token)
);

CREATE INDEX idx_push_tokens_tenant_enabled
  ON public.mobile_push_tokens(tenant_id, enabled, last_used_at);
```

---

## 8. Offline-First Sync

### 8.1 Akış

```
┌──────────────────────────────────────────────────────────────┐
│  Mobile Online:                                               │
│  - Direkt API call                                           │
│  - AsyncStorage'a yazma (sadece cache için)                  │
│  - TanStack Query cache invalidation                         │
│                                                              │
│  Mobile Offline:                                              │
│  - Aksiyonu AsyncStorage queue'ya ekle                       │
│  - "Çevrimdışı" banner göster                                │
│  - Local state'i güncelle (optimistic UI)                    │
│                                                              │
│  Mobile Online Again:                                         │
│  - NetInfo dinle                                             │
│  - Auto-flush queue (background)                             │
│  - Hata olanları retry                                       │
│  - Banner'ı gizle                                            │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 Desteklenen Offline Aksiyonlar

| Tip | Endpoint |
|-----|----------|
| `order.updateStatus` | PATCH /mobile/orders/:id/status |
| `product.updateStock` | PATCH /mobile/products/:id/stock |
| `order.addNote` | POST /mobile/orders/:id/notes |

Queue max 500 aksiyon (FIFO eviction).

---

## 9. Test Sonuçları

### Yeni Testler (24)

| Test Grubu | Sayı | Sonuç |
|------------|------|-------|
| Dashboard (summary + 6 parallel queries) | 2 | ✅ |
| Orders (list, detail, status update) | 6 | ✅ |
| Products (list, lowStock filter, stock update) | 5 | ✅ |
| Push (register, unregister, send, error handling) | 11 | ✅ |

### Tüm Proje Test Özeti

| Paket | Test | Sonuç |
|-------|------|-------|
| **commerce-backend** | **232** | ✅ (+24) |
| control-plane | 90 | ✅ |
| storefront | 59 | ✅ |
| plugin-sdk | 61 | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **614+** ✅ | **+24 yeni** |

---

## 10. Dosya Yapısı

```
apps/mobile/                                       # 🆕
├── app.json                                       # Expo config (iOS + Android)
├── package.json                                   # Dependencies
├── tsconfig.json                                  # TypeScript strict
├── app/                                           # Expo Router (typed)
│   ├── _layout.tsx                                # Stack root + QueryClient
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx                              # Email/password + 2FA + biometric
│   ├── (tabs)/
│   │   ├── _layout.tsx                            # Bottom tab navigation
│   │   ├── index.tsx                              # Dashboard
│   │   ├── orders.tsx                             # Sipariş listesi
│   │   ├── products.tsx                           # Ürün listesi + stok
│   │   └── settings.tsx                           # Push toggle + logout
│   └── orders/[id].tsx                            # Sipariş detayı + status advance
├── src/
│   ├── api/client.ts                              # Axios + SecureStore + refresh
│   ├── store/
│   │   ├── auth.ts                                # Zustand auth store
│   │   └── offline-queue.ts                       # AsyncStorage queue
│   ├── types/                                     # (gelecek)
│   └── utils/                                     # (gelecek)

apps/commerce-backend/src/modules/mobile/          # 🆕
├── mobile.service.ts                              # 11 KB (dashboard, orders, push)
├── mobile.controller.ts                           # 4.8 KB (8 endpoint)
├── mobile.module.ts
└── __tests__/mobile.service.test.ts               # 24 test
```

---

## 11. Production Checklist

- [x] Expo Router (typed routes)
- [x] Zustand auth store
- [x] TanStack Query (server cache + offline-aware)
- [x] AsyncStorage offline queue (max 500)
- [x] SecureStore (Keychain / EncryptedSharedPrefs)
- [x] Axios + auto refresh token
- [x] Biometric auth (Face ID / Touch ID / Parmak izi)
- [x] Push notification registration
- [x] Expo Push API entegrasyonu
- [x] Dashboard (5 KPI + recent orders)
- [x] Order management (list + detail + status)
- [x] Product management (list + stock update)
- [x] Settings (push toggle + biometric toggle + logout)
- [x] Mobile backend endpoints (8 adet)
- [x] Push notification DB
- [ ] iOS build (App Store) — EAS Build
- [ ] Android build (Play Store) — EAS Build
- [ ] Push notification backend job (zamanlı kontrol) — Faz 24.5
- [ ] Deep linking (notification → sayfa) — Faz 24.5
- [ ] App icon + splash screen design — Faz 24.5

---

## 12. Sprint 25+ Önerileri

| Sprint | İçerik | Süre | Öncelik |
|--------|--------|------|---------|
| **24.5** | App Store/Play Store submission + icon design | 3 gün | 🟡 |
| **25** | AI destekli auto-respond (LLM) | 7 gün | 🟡 |
| **26** | Multi-region + CDN | 7 gün | 🟠 |
| **27** | Public knowledge base + search | 3 gün | 🟢 |
| **28** | Plugin auto-update notification | 3 gün | 🟡 |

---

*Son güncelleme: 2026-07-07 — Faz 24 Mobile App*
*Toplam: 24 Faz, 614+ test*