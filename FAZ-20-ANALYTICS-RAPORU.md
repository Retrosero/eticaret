# Faz 20 — Analytics & Reporting Dashboard

**Tarih:** 2026-07-07
**Süre:** ~3 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Her tenant'ın mağazası için **detaylı analitik dashboard**:
- Satış özeti (ciro, AOV, müşteri)
- En çok satan ürünler / kategoriler
- Müşteri cohort (retention) analizi
- Conversion funnel (visitor → order)
- Kanal bazlı gelir
- Real-time istatistikler
- CSV export

---

## 2. Mimari

```
┌────────────────────────────────────────────────────────────────┐
│  Analytics Dashboard (tenant-admin/app/analytics)              │
│  - Real-time stats                                              │
│  - Satış trend chart (SVG)                                      │
│  - Conversion funnel (visualization)                            │
│  - Top products table                                           │
│  - CSV export link                                              │
└────────────────────┬───────────────────────────────────────────┘
                     │ GET /analytics/{overview,top-products,...}
                     ▼
┌────────────────────────────────────────────────────────────────┐
│  commerce-backend (AnalyticsService)                            │
│  8 endpoint, tenant-scoped SQL, 5min cache                     │
└────────────────────┬───────────────────────────────────────────┘
                     │ pg.Pool (tenant_id filter)
                     ▼
       PostgreSQL: orders, order_items, products,
                   customers, analytics_events
```

---

## 3. Analytics API

### 3.1 Sales Overview

```http
GET /analytics/overview?range=30d

→ 200 OK
{
  "range": "30d",
  "totalRevenue": 1000000,
  "totalOrders": 50,
  "averageOrderValue": 20000,
  "uniqueCustomers": 30,
  "refunds": 5000,
  "newVsReturning": { "new": 10, "returning": 20 },
  "dailySeries": [
    { "date": "2026-07-01", "revenue": 50000, "orders": 3 },
    { "date": "2026-07-02", "revenue": 75000, "orders": 4 }
  ]
}
```

### 3.2 Top Products

```http
GET /analytics/top-products?range=30d&limit=10

→ 200 OK
[
  {
    "productId": "p-1",
    "productName": "Ürün 1",
    "sku": "SKU-1",
    "imageUrl": "https://cdn/img.jpg",
    "unitsSold": 100,
    "revenue": 500000,
    "orderCount": 30
  }
]
```

### 3.3 Conversion Funnel

```http
GET /analytics/funnel?range=30d

→ 200 OK
{
  "range": "30d",
  "stages": [
    { "name": "Ziyaretçi", "count": 1000, "conversionRate": 0, "dropoffRate": 100 },
    { "name": "Sepete Ekleme", "count": 300, "conversionRate": 30, "dropoffRate": 70 },
    { "name": "Ödeme Başlatma", "count": 100, "conversionRate": 33.33, "dropoffRate": 66.67 },
    { "name": "Sipariş", "count": 50, "conversionRate": 50, "dropoffRate": 50 }
  ]
}
```

### 3.4 Customer Cohort

```http
GET /analytics/cohort?months=12

→ 200 OK
{
  "months": 12,
  "cohorts": [
    {
      "cohort": "2026-01",
      "size": 25,
      "retention": [1, 0.6, 0.4, 0.3, 0.25, 0.2, 0.18, 0.15, 0.12, 0.1, 0.08, 0.05]
    },
    {
      "cohort": "2026-02",
      "size": 30,
      "retention": [1, 0.65, 0.45, 0.35, 0.28, ...]
    }
  ]
}
```

### 3.5 Real-time Stats

```http
GET /analytics/realtime

→ 200 OK
{
  "activeVisitors": 25,
  "todayOrders": 10,
  "todayRevenue": 50000,
  "pendingOrders": 5,
  "lastOrderAt": "2026-07-07T10:00:00.000Z"
}
```

### 3.6 CSV Export

```http
GET /analytics/export/orders?range=30d

→ 200 OK
Content-Type: text/csv

Sipariş No,Müşteri Email,Ad Soyad,Tutar,Durum,Tarih
T1-20260706-001,ali@example.com,Ali Veli,10000,completed,2026-07-06T10:00:00.000Z
...
```

---

## 4. Analytics Dashboard UI

**`apps/tenant-admin/src/app/analytics/page.tsx` + `AnalyticsCharts.tsx`**

**Bölümler:**
1. **Range selector** — 24s, 7g, 30g, 90g, 1y
2. **Real-time stats** (4 stat box)
   - Aktif ziyaretçi (son 1 saat)
   - Bugün sipariş
   - Bugün ciro
   - Bekleyen sipariş (uyarı rengi)
3. **Sales overview** (6 stat box)
   - Toplam ciro, sipariş, AOV, müşteri
   - Yeni müşteri, geri gelen
4. **Daily series chart** (SVG line chart, hover tooltip)
5. **Conversion funnel** (visualized horizontal bars + dönüşüm oranı)
6. **Top products table** (image, SKU, adet, sipariş, ciro)
7. **CSV export** (link)

**Vanilla SVG charts:**
- Line + area chart (satış trendi)
- Bar chart (gelecekte)
- Hover tooltip
- Y axis grid + ticks
- X axis labels (her 5 noktada)
- Dependency-free (chart.js/recharts gerekmez)

---

## 5. Mimari Kararlar

### 5.1 Range Standardizasyonu
- `24h | 7d | 30d | 90d | 1y | all`
- Her query range'i `interval` SQL'e çevirir
- Default: `30d`

### 5.2 SQL Performans
- `WHERE tenant_id = $1 AND created_at > now() - interval` (index hit)
- `GROUP BY date_trunc('day', ...)` — günlük seriler
- `COUNT(DISTINCT ...)` — unique customer
- Subquery + CTE (cohort)

### 5.3 Vanilla SVG Charts
- chart.js / recharts / d3 gibi 100KB+ dependency yok
- Server-side render uyumlu (Next.js)
- Custom hover interaction (state)
- Responsive (viewBox)

### 5.4 Cache Stratejisi
- 5 dakika cache (tenant_id + range)
- Real-time stats cache'lenmez (her 30 saniye polling)

### 5.5 CSV Export
- Inline streaming (10K limit)
- UTF-8 BOM (Excel uyumlu)
- Content-Disposition: attachment

### 5.6 Cohort Mantığı
- İlk sipariş ayına göre cohort ataması
- Her cohort için: ay 0, 1, 2, ... retention
- Aylık active customer sayısı / cohort büyüklüğü

### 5.7 Funnel Events
- `analytics_events` tablosu gerekir
- Event tipleri: `page_view`, `add_to_cart`, `checkout_started`
- Session bazlı COUNT DISTINCT

---

## 6. Veritabanı

`analytics_events` tablosu (Faz 20 ile birlikte):

```sql
CREATE TABLE public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id VARCHAR(100) NOT NULL,
  user_id UUID,
  event_type VARCHAR(50) NOT NULL,  -- page_view, add_to_cart, ...
  path VARCHAR(500),
  referrer VARCHAR(500),
  user_agent TEXT,
  ip_address INET,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_tenant_session
  ON public.analytics_events(tenant_id, session_id, created_at DESC);
CREATE INDEX idx_analytics_events_tenant_type
  ON public.analytics_events(tenant_id, event_type, created_at DESC);
```

`orders.channel` kolonu (kanal bazlı gelir için):

```sql
ALTER TABLE public.orders
  ADD COLUMN channel VARCHAR(50) DEFAULT 'direct';
-- direct, marketplace, social, email, other
```

---

## 7. Test Sonuçları

### Yeni Testler (13)

| Test | Sayı | Sonuç |
|------|------|-------|
| `analytics.service.test.ts` | 13 | ✅ |

**Kapsam:**
- `getSalesOverview()` — tüm metrikler, sıfır sipariş durumu
- `getTopProducts()` — limit, image
- `getTopCategories()` — kategori bazlı
- `getCustomerCohort()` — retention matrix
- `getConversionFunnel()` — 4 aşama, sıfır visitors
- `getRevenueByChannel()` — kanal bazlı
- `getRealtimeStats()` — 4 paralel query, lastOrderAt null
- `exportOrdersCsv()` — CSV format
- Range parsing (24h, 7d, 30d, 90d, 1y, all, invalid)

### Tüm Proje Test Özeti

| Paket | Test | Sonuç |
|------|------|-------|
| commerce-backend | **193** | ✅ (+13) |
| plugin-sdk | 19 | ✅ |
| control-plane | 63 | ✅ |
| storefront | 59 | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **506+** ✅ | **+13 yeni** |

---

## 8. Dosya Yapısı (Faz 20)

```
apps/commerce-backend/src/modules/analytics/    # 🆕
├── analytics.service.ts                        # 17 KB (8 metrik)
├── analytics.controller.ts                     # 5 KB (8 endpoint + Zod)
├── analytics.module.ts
└── __tests__/analytics.service.test.ts         # 13 test

apps/tenant-admin/src/app/analytics/            # 🆕
├── page.tsx                                    # 12 KB (server component)
└── AnalyticsCharts.tsx                         # 6 KB (SVG line/bar chart)
```

---

## 9. Production Checklist

- [x] Tenant-scoped SQL
- [x] Range validation
- [x] Cache (5 dakika)
- [x] CSV export
- [x] Hover tooltip
- [ ] Materialized view (Faz 20.5 — performans)
- [ ] Real-time SSE (Faz 20.5)
- [ ] Webhook trigger (örn. ciro hedefe ulaştı)
- [ ] Email rapor (haftalık/aylık)
- [ ] Custom dashboard widget (tenant-specific)
- [ ] BigQuery export (advanced tenant)

---

## 10. Kullanım Senaryoları

### 🛒 Yeni Mağaza Sahibi
- Dashboard'a giriş → son 30 gün özetini görür
- Real-time stats ile canlı takip
- Top products ile hangi ürünler çok satıyor anlar
- Funnel ile nereden drop-off olduğunu görür

### 📈 Büyüyen Mağaza
- Cohort analizi ile retention oranını ölçer
- New vs returning müşteri oranını görür
- Kanal bazlı gelir ile hangi kanal yatırım getirisi yüksek anlar
- CSV export ile muhasebe/vergi için rapor alır

### 💼 Pazarlama Ekibi
- Funnel'de sepete ekleme → ödeme oranı düşükse UX iyileştirmesi
- Cohort ile hangi kampanya retention artırdı analiz eder
- Top products ile çapraz satış fırsatlarını belirler

---

## 11. Sprint 21+ Önerileri

| Sprint | İçerik | Süre |
|--------|--------|------|
| **20.5** | Materialized view + real-time SSE | 3 gün |
| **21** | Help center / ticket sistemi | 3-5 gün |
| **22** | Super admin SSO + RBAC | 3 gün |
| **23** | Plugin sandboxing + versioning | 5 gün |
| **24** | Mobile app (React Native + Expo) | 14+ gün |
| **25** | AI-powered ürün önerileri | 7 gün |

---

*Son güncelleme: 2026-07-07 — Faz 20 Analytics*
*Toplam: 41+ Faz, 506+ test*