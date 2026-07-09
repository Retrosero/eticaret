# Faz 13 — Gelişmiş SEO Optimizasyonu

**Tarih:** 2026-07-06
**Süre:** ~2 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

EtiCart mağazalarının Google, Bing, Yandex arama motorlarında üst sıralarda çıkması için **kurumsal düzeyde SEO altyapısı** kurmak. Schema.org yapısal veri, Open Graph, Twitter Cards, sitemap, robots.txt ve Core Web Vitals optimizasyonu.

---

## 2. Mimari

```
┌──────────────────────────────────────────────────────────────┐
│                  @eticart/storefront/seo                      │
├──────────────────────────────────────────────────────────────┤
│  src/lib/seo/                                                │
│   ├─ types.ts          → 30+ TypeScript tipi                │
│   ├─ site-config.ts    → Runtime env-driven site config     │
│   ├─ metadata.ts       → Next.js Metadata builder           │
│   ├─ schemas.ts        → Schema.org JSON-LD factories       │
│   ├─ json-ld.tsx       → React JSON-LD component            │
│   ├─ sitemap.ts        → XML Sitemap generator              │
│   ├─ robots.ts         → robots.txt generator               │
│   └─ __tests__/        → 34 SEO unit testi                  │
│                                                               │
│  src/app/                                                    │
│   ├─ sitemap.ts        → /sitemap.xml endpoint               │
│   ├─ robots.ts         → /robots.txt endpoint                │
│   └─ manifest.ts       → /manifest.json (PWA)                │
└──────────────────────────────────────────────────────────────┘
                                │
                                ▼
         Google Search Console / Bing Webmaster / Yandex
```

---

## 3. SEO Bileşenleri

### 3.1 Yapısal Veri (Schema.org JSON-LD)

Google Rich Results için gerekli tüm şemalar:

| Schema | Kullanım | Test Edildi |
|--------|----------|-------------|
| **Organization** | Site geneli (logo, contact, sameAs) | ✅ |
| **WebSite** | SearchAction ile site içi arama | ✅ |
| **Product** | Ürün detay (Offer, AggregateRating, SKU, GTIN) | ✅ |
| **BreadcrumbList** | Tüm sayfalar (sayfa hiyerarşisi) | ✅ |
| **FAQPage** | SSS bölümleri | ✅ |
| **Article** | Blog yazıları (author, publisher, dates) | ✅ |
| **ItemList** | Kategori listeleme (Google "ürün listesi" rich result) | ✅ |
| **LocalBusiness** | Fiziksel mağazalar (Faz 14+) | - |

**Product schema örneği:**
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "iPhone 15 Pro",
  "sku": "SKU-IPH15-PRO",
  "gtin": "8691234567890",
  "brand": { "@type": "Brand", "name": "Apple" },
  "offers": {
    "@type": "Offer",
    "price": 42999.00,
    "priceCurrency": "TRY",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "seller": { "@type": "Organization", "name": "EtiCart" }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.7,
    "reviewCount": 128
  }
}
```

### 3.2 Meta Tags (Next.js Metadata API)

| Tag | Açıklama |
|-----|----------|
| `title` | Sayfa başlığı + site template (`%s \| EtiCart`) |
| `description` | Meta description (max 160 karakter) |
| `canonical` | Duplicate içerik önleme |
| `robots` | `index, follow, max-snippet, max-image-preview` |
| `keywords` | Sayfa etiketleri |
| `author` | Yazar (article) |
| `publisher` | Yayıncı |
| `application-name` | PWA app name |
| `format-detection` | Telefon/email auto-detection kapatma |
| `theme-color` | Mobil browser tema rengi |
| `manifest` | PWA manifest linki |
| `apple-itunes-app` | iOS Smart App Banner |

### 3.3 Open Graph (Facebook, LinkedIn, vb.)

```ts
openGraph: {
  type: 'article' | 'product' | 'website',
  locale: 'tr_TR',
  alternateLocale: 'en_US',
  title, description, url, siteName,
  images: [{ url, width: 1200, height: 630, alt }],
  publishedTime, modifiedTime, authors, section, tags,
}
```

### 3.4 Twitter Cards

```ts
twitter: {
  card: 'summary_large_image', // veya 'summary'
  site: '@eticart',
  creator: '@eticart',
  title, description,
  images: [{ url }],
}
```

### 3.5 XML Sitemap

`/sitemap.xml` Next.js native:
- 16 statik sayfa (anasayfa, ürünler, KVKK, vb.)
- Dinamik: API'den çekilen ürünler/kategoriler/markalar
- `lastModified`, `changeFrequency`, `priority` (0.0 - 1.0)
- `alternates.languages` (hreflang)

**Yapılandırma:**
```ts
{
  path: '/',
  changeFrequency: 'daily',
  priority: 1.0,
  alternates: { 'tr-TR': '/', 'en-US': '/en' },
}
```

### 3.6 robots.txt

Akıllı crawl rules:
- ✅ Public sayfalar → Allow
- ❌ `/admin`, `/api`, `/sepet`, `/odeme`, `/hesap` → Disallow
- 🤖 Googlebot, Bingbot → Detaylı kurallar
- 🚫 Bad bots (Ahrefs, Semrush, MJ12, DotBot) → Tamamen engelle
- 🤖 AI training bot'ları → Sadece blog
- ⏱️ Crawl-delay: 1 saniye

### 3.7 Hreflang (Çoklu Dil)

```html
<link rel="alternate" hreflang="tr-TR" href="https://eticart.com.tr/urun/iphone-15" />
<link rel="alternate" hreflang="en-US" href="https://eticart.com.tr/en/product/iphone-15" />
```

### 3.8 Canonical URL

- Tenant bazlı (subdomain: `demo.eticart.com.tr` veya path: `/m/demo`)
- Trailing slash normalize
- Query string kaldırma (tracking param'ları)
- HTTPS zorunlu

---

## 4. PWA + Manifest

```json
{
  "name": "EtiCart",
  "short_name": "EtiCart",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#0a0a0a",
  "background_color": "#ffffff",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192" },
    { "src": "/icon-512.png", "sizes": "512x512" },
    { "src": "/icon-maskable-512.png", "purpose": "maskable" }
  ]
}
```

---

## 5. Core Web Vitals (CWV)

Next.js 15 App Router otomatik optimizasyonlar:

| Metric | Hedef | Uygulama |
|--------|-------|----------|
| **LCP** | < 2.5s | Server Components, image optimization (`next/image`), preload |
| **FID/INP** | < 200ms | Minimal client JS, RSC default, deferred hydration |
| **CLS** | < 0.1 | `next/image` reserved space, font `display: swap`, no late layout shifts |
| **TTFB** | < 600ms | Edge caching, ISR (revalidate), streaming SSR |
| **FCP** | < 1.8s | Preconnect to CDN, DNS prefetch (layout'ta eklendi) |

---

## 6. Test Sonuçları

### Storefront SEO

| Test | Kapsam |
|------|--------|
| `seo.test.ts` | 34 test — site-config, metadata, schemas, sitemap, robots, canonical |
| Önceki vitest | 25 test (mevcut) |
| **TOPLAM** | **59 test** ✅ |

### Tüm Proje

| Paket | Test | Sonuç |
|------|------|-------|
| commerce-backend | 164 + 1 skip | ✅ |
| **storefront** | **59** | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **395+** ✅ | **0 type-error** |

---

## 7. SEO Checklist (Production)

### Yapısal Veri ✅
- [x] Organization schema (site-wide)
- [x] WebSite schema (SearchAction)
- [x] Product schema (tüm ürünler)
- [x] BreadcrumbList (tüm sayfalar)
- [x] FAQPage (SSS sayfaları)
- [x] Article schema (blog)
- [x] ItemList (kategori listeleme)

### Meta Tags ✅
- [x] Title (template + default)
- [x] Description
- [x] Canonical URL
- [x] Robots (index, follow, max-snippet)
- [x] Open Graph (type, locale, image)
- [x] Twitter Cards (summary_large_image)
- [x] Hreflang alternates

### Sitemap & robots ✅
- [x] /sitemap.xml (statik + dinamik)
- [x] /robots.txt (akıllı kurallar)
- [x] /manifest.json (PWA)
- [x] Sitemap index (multi-tenant için)

### Webmaster Tools (Yapılacak) ⏳
- [ ] Google Search Console doğrulama
- [ ] Bing Webmaster doğrulama
- [ ] Yandex Webmaster doğrulama
- [ ] Yapısal veri test aracı doğrulaması

### Core Web Vitals ⏳
- [x] DNS prefetch (layout.tsx)
- [x] next/image (otomatik)
- [x] next/font (otomatik)
- [ ] Bundle analyzer ile JS kontrol
- [ ] CDN edge cache (Cloudflare/Coolify)

---

## 8. Google Search Console Doğrulama

`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env değişkeni ile:

```bash
# .env.production
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=abc123...
NEXT_PUBLIC_YANDEX_VERIFICATION=xyz789...
```

Bu değerler otomatik olarak `metadata.other.google-site-verification` meta tag'ine yazılır.

---

## 9. Kritik Dosya Yolları

```
apps/storefront/src/
├── lib/seo/
│   ├── types.ts                       # 30+ TypeScript tipi
│   ├── site-config.ts                 # Runtime site config
│   ├── metadata.ts                    # Next.js Metadata builder
│   ├── schemas.ts                     # Schema.org factories
│   ├── json-ld.tsx                    # React component
│   ├── sitemap.ts                     # XML Sitemap generator
│   ├── robots.ts                      # robots.txt generator
│   ├── index.ts                       # Public exports
│   └── __tests__/
│       └── seo.test.ts                # 34 test
├── app/
│   ├── layout.tsx                     # JSON-LD root (Organization + WebSite)
│   ├── page.tsx                       # Anasayfa (ItemList + BreadcrumbList)
│   ├── sitemap.ts                     # /sitemap.xml endpoint
│   ├── robots.ts                      # /robots.txt endpoint
│   ├── manifest.ts                    # /manifest.json endpoint
│   └── [[...slug]]/urun/[slug]/page.tsx  # Ürün detay (Product schema + generateMetadata)
```

---

## 10. Sonuç

**Eticart artık Google-friendly bir SaaS:**

- ✅ 7 Schema.org tipi (Organization, WebSite, Product, BreadcrumbList, FAQ, Article, ItemList)
- ✅ Next.js Metadata API (Open Graph + Twitter Cards)
- ✅ XML Sitemap (statik + dinamik, hreflang ile)
- ✅ robots.txt (akıllı crawl rules, bad bot engelleme)
- ✅ Canonical URL sistemi (multi-tenant subdomain)
- ✅ Hreflang (TR/EN)
- ✅ PWA manifest
- ✅ Core Web Vitals için Next.js 15 optimizasyonları
- ✅ 34 SEO unit testi (hepsi yeşil)
- ✅ 0 type hatası

**Sıralamada Google'da üst sıralarda yer almak için gereken teknik altyapı tamamlandı.** İçerik stratejisi ve backlink çalışmaları (off-page SEO) ile desteklenmeli.

---

*Son güncelleme: 2026-07-06 — Faz 13 SEO*
*Toplam: 41 Faz, 395+ test, 0 tip hatası*