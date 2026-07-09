# Faz 26 — Multi-Region + CDN

**Tarih:** 2026-07-07
**Süre:** ~5 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

EtiCart'i **global SaaS** ölçeğine taşı:

- ✅ 4 coğrafi region (TR, EU, US, APAC)
- ✅ Geo-routing (ülke/koordinat → en yakın region)
- ✅ Edge cache (Redis + CDN-friendly headers)
- ✅ Health check per region
- ✅ Failover logic (down region → yedek region)
- ✅ Tenant data residency (KVKK/GDPR uyumlu)
- ✅ Region migration audit trail

---

## 2. Mimari

```
┌──────────────────────────────────────────────────────────────────┐
│  Global Edge Layer (Cloudflare / Vercel)                          │
│  - DDoS koruması                                                  │
│  - Wildcard SSL (Faz 15)                                          │
│  - Geo-routing (CF-IPCountry, CF-IPCity, CF-IPLat/Lng)           │
│  - Edge cache (Cloudflare Workers KV)                            │
└──────────────────────────────────────────────────────────────────┘
                                ↓
       ┌──────────────┬──────────────┬──────────────┐
       ↓              ↓              ↓              ↓
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ tr-ist      │ │ eu-fra      │ │ us-east     │ │ apac-sin    │
│ İstanbul    │ │ Frankfurt   │ │ Virginia    │ │ Singapore   │
│ KVKK zorunlu│ │ GDPR zorunlu│ │ CCPA        │ │ PDPA        │
│ tr.eticart  │ │ eu.eticart  │ │ us.eticart  │ │ apac.eticart│
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
       ↓              ↓              ↓              ↓
   ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
   │Postgres│    │Postgres│    │Postgres│    │Postgres│
   │ Primary│    │ Primary│    │ Primary│    │ Primary│
   │ Replica│    │ Replica│    │ Replica│    │ Replica│
   └────────┘    └────────┘    └────────┘    └────────┘
       ↓              ↓              ↓              ↓
   ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
   │  Redis │    │  Redis │    │  Redis │    │  Redis │
   │  Cache │    │  Cache │    │  Cache │    │  Cache │
   └────────┘    └────────┘    └────────┘    └────────┘
       ↓              ↓              ↓              ↓
   ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
   │  R2/S3 │    │  R2/S3 │    │  R2/S3 │    │  R2/S3 │
   │ eu-c-1 │    │ eu-c-1 │    │ us-e-1 │    │ ap-se-1│
   └────────┘    └────────┘    └────────┘    └────────┘

Cross-region replication:
- Async WAL streaming (PostgreSQL logical replication)
- Redis cache: stale-while-revalidate
- Storage: cross-region replication (S3 CRR / R2)
```

---

## 3. packages/region-router

### 3.1 Region Definitions

```typescript
type RegionCode = 'tr-ist' | 'eu-fra' | 'us-east' | 'apac-sin';

const REGIONS = {
  'tr-ist': {
    name: 'Türkiye (İstanbul)',
    city: 'İstanbul',
    country: 'TR',
    lat: 41.0082,
    lng: 28.9784,
    dbPrimary: 'postgres://primary.tr-ist.eticart.internal:5432/eticart',
    dbReplicas: [...],
    redisUrl: 'redis://redis.tr-ist.eticart.internal:6379',
    storageRegion: 'eu-central-1',
    defaultLocale: 'tr',
    dataResidencyRequired: true,
    regulatory: 'KVKK (Türkiye)',
  },
  'eu-fra': {
    name: 'Europe (Frankfurt)',
    regulatory: 'GDPR (EU)',
    dataResidencyRequired: true,
    // ...
  },
  'us-east': { /* ... */ regulatory: 'CCPA (California)' },
  'apac-sin': { /* ... */ regulatory: 'PDPA (Singapore)' },
};
```

### 3.2 Geo-Router

```typescript
const router = new GeoRouter();

// Ülke kodu → region mapping
const decision = router.route(
  { country: 'TR', lat: 41.0082, lng: 28.9784 },
  {
    tenantPinnedRegion?: 'tr-ist',
    manualRegion?: 'eu-fra',
    regionHealth?: healthMap,
    fallbackRegion?: 'us-east',
  },
);

// RoutingDecision:
// {
//   region: 'tr-ist',
//   reason: 'country_match' | 'tenant_pinned' | 'manual_override' | 'geo_distance' | 'failover' | 'default',
//   distanceKm: 12.5,
//   alternatives: ['eu-fra', 'us-east', 'apac-sin'],
// }
```

**Routing sırası:**
1. **Tenant pin** — en yüksek öncelik (data residency)
2. **Manual override** (X-Region header)
3. **Country match** (TR → tr-ist, DE → eu-fra, vb.)
4. **Geo-distance** (Haversine formula — koordinat varsa)
5. **Failover** (down region'ı atla, en yakın aktif)
6. **Default** (tr-ist)

**Haversine:**
```typescript
function haversineDistance(lat1, lng1, lat2, lng2): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// İstanbul ↔ New York ≈ 8000 km
// İstanbul ↔ Frankfurt ≈ 1900 km
// İstanbul ↔ Ankara ≈ 350 km
```

### 3.3 Cloudflare/Vercel Header Parsing

```typescript
parseGeoFromHeaders({
  'cf-ipcountry': 'TR',
  'cf-ipcity': 'Istanbul',
  'cf-iplatitude': '41.0082',
  'cf-iplongitude': '28.9784',
});
// → { country: 'TR', city: 'Istanbul', lat: 41.0082, lng: 28.9784 }
```

Desteklenen: Cloudflare (`CF-*`), Vercel (`X-Vercel-IP-*`), generic (`X-Geo-*`).

---

## 4. Edge Cache

### 4.1 InMemoryCache + Redis Adapter

```typescript
// Production'da RedisCache, development'ta InMemoryCache
const cache = new InMemoryCache();

await cache.set('eticart:cache:tr-ist:tenant:abc:products:list', products, 300); // 5dk TTL
const cached = await cache.get('eticart:cache:tr-ist:tenant:abc:products:list');

// Cache-aside pattern
const products = await cacheAside(
  cache,
  'products:list:tenant-1',
  async () => db.query('SELECT * FROM products WHERE tenant_id = $1', ['tenant-1']),
  60, // TTL 60s
);

// Pattern delete (tenant tüm cache temizle)
const deleted = await cache.delPattern('eticart:cache:tr-ist:tenant:abc:*');
```

### 4.2 CDN Cache Headers

```typescript
// Storefront public sayfa
cacheControlHeader('public', {
  maxAge: 60,
  sMaxAge: 300,
  staleWhileRevalidate: 600,
});
// → "public, max-age=60, s-maxage=300, stale-while-revalidate=600"

// Admin panel
cacheControlHeader('private');
// → "private, max-age=0, no-cache"

// API mutations
cacheControlHeader('no-store');
// → "no-store, max-age=0"
```

### 4.3 Region-Scoped Keys

```
eticart:cache:tr-ist:tenant:abc123:products:list
eticart:cache:eu-fra:tenant:xyz789:storefront:home
eticart:cache:us-east:branding:css:tenant:abc123
```

Her region kendi Redis'inde yazar, failover'da stale-while-revalidate kullanılır.

---

## 5. Failover Manager

### 5.1 Health Check

```typescript
const manager = new FailoverManager({ checkIntervalMs: 30_000 });

// Her 30 saniye DB ping (SELECT 1)
manager.startHealthChecks(async (dbUrl) => {
  await pg.connect(dbUrl).query('SELECT 1');
});

// Manuel kontrol
await manager.checkAll();
// → Her region için: { code, healthy, latencyMs, error? }

// Sağlık durumu
const health = manager.getHealth();
// → Map<RegionCode, RegionHealth>

// Failover target
const target = manager.selectFailoverTarget('tr-ist');
// → tr-ist down ise en yakın aktif region

// Tüm region down ise en düşük latency'li degraded
const emergency = manager.selectEmergencyTarget();
```

### 5.2 Sağlık Durumları

| Status | Anlam | Action |
|--------|-------|--------|
| `active` | < 500ms latency | Normal trafik |
| `degraded` | > 500ms latency | Uyarı + monitoring |
| `down` | Connection refused/timeout | Tüm trafik failover |
| `maintenance` | Planlı bakım | Tüm trafik failover |

### 5.3 Failover Stratejisi

```
Primary: tr-ist (Türkiye tenant'ları)
  ↓ tr-ist down
Failover: eu-fra (en yakın yedek)
  ↓ eu-fra da down
Emergency: us-east (en düşük latency'li)
  ↓ hepsi down
503 Service Unavailable
```

---

## 6. Tenant Data Residency

### 6.1 Compliance Framework Mapping

| Framework | Zorunlu Region'lar |
|-----------|---------------------|
| **KVKK** (TR) | sadece `tr-ist` |
| **GDPR** (EU) | `eu-fra` veya `tr-ist` |
| **CCPA** (US) | `us-east` veya `eu-fra` |
| **PDPA** (SG) | `apac-sin` |
| `none` | tüm region'lar |

### 6.2 Residency Manager

```typescript
const manager = new TenantResidencyManager();

// Yeni tenant
const residency = manager.create('tenant-1', 'TR', 'kvkk');
// → {
//     tenantId: 'tenant-1',
//     primaryRegion: 'tr-ist',
//     backupRegion: 'eu-fra',
//     compliance: 'kvkk',
//     migrationHistory: [],
//   }

// KVKK tenant'ı EU'ya migrate et → HATA!
manager.migrate(residency, 'eu-fra', 'admin@eticart.com.tr', 'test');
// → Error: Region eu-fra bu compliance (kvkk) için uygun değil.
//          İzin verilen: tr-ist

// GDPR tenant'ı EU'ya migrate et → OK
const euResidency = manager.create('tenant-2', 'DE', 'gdpr');
const migrated = manager.migrate(euResidency, 'eu-fra', 'admin@eticart.com.tr', 'request');
// → primaryRegion: 'eu-fra', backupRegion: 'tr-ist', migrationHistory: [...]

// Audit report
manager.getAuditReport(migrated);
// → { tenantId, currentRegion, compliance, totalMigrations, lastMigration }
```

### 6.3 KVKK Uyumu

- **Türkiye tenant'ı** → sadece `tr-ist` (İstanbul) region'ında veri
- Cross-region replication **read-only** (DR için)
- Tenant talep ederse + audit log ile **migration** mümkün
- Veri silme talebi → GDPR/KVKK Article 17 (right to be forgotten)

---

## 7. Control-Plane Middleware

### 7.1 Region Middleware

```typescript
@Injectable()
export class RegionMiddleware implements NestMiddleware {
  use(req, res, next) {
    const headers = {
      'cf-ipcountry': req.headers['cf-ipcountry'],
      'cf-ipcity': req.headers['cf-ipcity'],
      // ...
    };
    const geo = parseGeoFromHeaders(headers);
    const decision = this.router.route(geo, {
      manualRegion: req.headers['x-region'],
      regionHealth: this.failover.getHealth(),
    });

    req.region = decision.region;
    req.regionReason = decision.reason;

    res.setHeader('X-Served-By-Region', decision.region);
    res.setHeader('X-Region-Reason', decision.reason);

    next();
  }
}
```

### 7.2 Region Endpoints

```http
GET /api/v1/regions
  → { regions: [{ code, name, city, country, ... }], total: 4 }

GET /api/v1/regions/health/all
  → { regions: [{ code, status, latencyMs, lastCheckedAt, ... }] }

GET /api/v1/regions/tr-ist/health
  → { code, healthy, latencyMs, error? }
```

---

## 8. Test Sonuçları

### Yeni Testler (64)

| Test Grubu | Sayı | Sonuç |
|------------|------|-------|
| **Haversine Distance** | 3 | ✅ |
| **GeoRouter** (11 routing senaryosu) | 11 | ✅ |
| **parseGeoFromHeaders** | 4 | ✅ |
| **REGIONS** | 4 | ✅ |
| **InMemoryCache** (get/set/del/delPattern/expire/stats) | 11 | ✅ |
| **CacheKeyBuilder** | 2 | ✅ |
| **cacheAside** | 2 | ✅ |
| **cacheControlHeader** | 4 | ✅ |
| **FailoverManager** (health, markDown, selectFailover, startHealthChecks) | 9 | ✅ |
| **Compliance Mapping** (KVKK/GDPR/CCPA/PDPA) | 7 | ✅ |
| **TenantResidencyManager** (create, migrate, audit, compliance check) | 6 | ✅ |
| **RegionHelpers** (getActiveRegion, getRegionHostname, getRegionApiUrl) | 3 | ✅ |

### Tüm Proje Test Özeti

| Paket | Test | Sonuç |
|-------|------|-------|
| commerce-backend | **246** | ✅ |
| control-plane | 90 | ✅ |
| storefront | 59 | ✅ |
| plugin-sdk | 61 | ✅ |
| ai | 47 | ✅ |
| **region-router** | **64** | ✅ (yeni) |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **739+** ✅ | **+64 yeni** |

---

## 9. Dosya Yapısı

```
packages/region-router/                               # 🆕
├── package.json
├── tsconfig.json
├── src/
│   ├── region.ts                                     # 3.8 KB — 4 region
│   ├── geo-router.ts                                 # 7 KB — routing logic
│   ├── edge-cache.ts                                 # 4.8 KB — Redis-ready cache
│   ├── failover.ts                                   # 6.2 KB — health check + failover
│   ├── tenant-residency.ts                           # 4.3 KB — KVKK/GDPR
│   └── index.ts                                      # exports + helpers
└── __tests__/
    ├── geo-router.test.ts                            # 24 test
    └── infra.test.ts                                 # 40 test

apps/control-plane/src/region/                        # 🆕
├── region.middleware.ts                              # 2 KB — Express middleware
├── region.controller.ts                              # 1.5 KB — 3 endpoint
└── region.module.ts
```

---

## 10. Production Checklist

- [x] 4 region definition (TR, EU, US, APAC)
- [x] Geo-router (country match + Haversine + failover)
- [x] Cloudflare/Vercel header parsing
- [x] Edge cache (in-memory + Redis-ready)
- [x] CDN Cache-Control headers (public/private/no-store)
- [x] Cache-aside pattern
- [x] Region-scoped cache keys
- [x] Failover manager (health check + auto/manual failover)
- [x] Tenant data residency (KVKK/GDPR/CCPA/PDPA)
- [x] Migration audit trail
- [x] Region middleware (Express)
- [x] Region public endpoints (list + health)
- [ ] PostgreSQL logical replication (cross-region) — Faz 26.5
- [ ] Redis cluster with cross-region replication — Faz 26.5
- [ ] Cloudflare Workers integration — Faz 26.5
- [ ] Global load balancer (AWS Route53 / Cloudflare LB) — Faz 26.5
- [ ] Per-region monitoring dashboard (Grafana) — Faz 26.5
- [ ] Disaster recovery playbook — Faz 26.5

---

## 11. Sprint 27+ Önerileri

| Sprint | İçerik | Süre | Öncelik |
|--------|--------|------|---------|
| **26.5** | PostgreSQL cross-region replication + Cloudflare LB | 5 gün | 🟠 |
| **27** | Public knowledge base + search | 3 gün | 🟢 |
| **28** | Plugin auto-update notification | 3 gün | 🟡 |
| **29** | Tenant analytics + churn prediction | 5 gün | 🟡 |

---

*Son güncelleme: 2026-07-07 — Faz 26 Multi-Region*
*Toplam: 26 Faz, 739+ test*