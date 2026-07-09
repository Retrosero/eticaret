# Mimari Özet — Türkçe E-Ticaret SaaS

> Faz 1 kapsamında, ADR-001 doğrultusunda oluşturulmuş üst düzey mimari harita.

---

## 1. Mimari Stil

- **Multi-tenant (çok kiracılı)** — Fiziksel izolasyon (her tenant ayrı Postgre şeması).
- **Modüler monolit + ayrılmış kontrol düzlemi** — E-ticaret çekirdeği (Medusa) ayrı bir backend; SaaS kontrolü (NestJS) ayrı bir backend.
- **API-first** — Tüm platformlar arası iletişim REST + OpenAPI üzerinden.
- **Ölçeklenebilir, gözlemlenebilir, güvenli, KVKK uyumlu.**

## 2. Bileşenler

### 2.1. Uygulamalar (`apps/`)

| Uygulama | Sorumluluk | Teknoloji |
|---|---|---|
| **storefront** | Müşteri vitrin; tenant domain'den hizmet verir | Next.js App Router, TypeScript |
| **tenant-admin** | Kiracı mağazasının yönetim paneli | Next.js, TypeScript |
| **super-admin** | SaaS operatörünün panosu (tenant listesi, faturalama) | Next.js, TypeScript |
| **commerce-backend** | Ürün, sepet, sipariş, ödeme, fatura | Medusa, Node.js |
| **control-plane** | Tenant yaşam döngüsü, domain, auth, faturalama | NestJS, TypeScript |

### 2.2. Paylaşılan Paketler (`packages/`)

- **`ui`** — Erişilebilir (WCAG), Türkçe yerelleştirilmiş React bileşenleri.
- **`theme-engine`** — Tenant başına tema değişkenleri (Faz 5).
- **`shared-types`** — API kontratları; hem backend hem frontend buradan tüketir.
- **`validation`** — Zod şemaları; istek gövdeleri ve env doğrulama.
- **`config`** — Ortak logger (pino), hata modeli, environment yükleyici.
- **`auth`** — JWT yardımcıları, RBAC tipleri (Faz 3).
- **`tenant-context`** — Domain → tenant çözümleme (Faz 2 için iskelet, Faz 0 PoC'sinden devralınır).
- **`payment-adapters`** — iyzico / PayTR / Param adaptörleri (Faz 6).
- **`shipping-adapters`** — Yurtiçi / Aras / MNG / PTS (Faz 6).
- **`notification-adapters`** — SMS / E-posta / push (Faz 9).
- **`observability`** — pino loglama, OpenTelemetry, Sentry, KVKK maskeleme.
- **`eslint-config`** — Paylaşılan ESLint kuralları.
- **`tsconfig`** — Paylaşılan TypeScript derleyici ayarları (strict mode).

### 2.3. Altyapı (`infra/`)

- **docker/** — Geliştirme ve üretim compose dosyaları.
- **migrations/** — Sıralı SQL dosyaları (idempotent).
- **scripts/** — Yardımcı scriptler (provision, seed, smoke).
- **coolify/** — Coolify uyumlu `docker-compose.prod.yml`.
- **monitoring/** — Prometheus + Grafana şablonları.

## 3. Veri Katmanı

| Veritabanı | Kapsam | Erişen |
|---|---|---|
| `pg_control` (şema `public`) | tenants, tenant_domains, plans, invoices, kvkk_audit | control-plane |
| `pg_app` (şema `tenant_*`) | Her tenant için ayrı şema: products, customers, orders, kvkk_audit | commerce-backend |

`packages/tenant-context` ile her istek geldiğinde doğru şemaya yönlendirme yapılır (Faz 2'de tamamlanacak).

## 4. Akış Diyagramı (Üst Düzey)

```
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│   storefront   │   │  tenant-admin  │   │  super-admin   │
│  (Next.js)     │   │   (Next.js)    │   │   (Next.js)    │
└───────┬────────┘   └────────┬───────┘   └────────┬───────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌────────────────────────────────────────────────────────────┐
│              commerce-backend (Medusa)                     │
│  • /store/cart, /store/products, /store/orders             │
│  • /admin/products, /admin/orders                          │
└─────────────────────────────┬──────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
        ┌──────────────┐             ┌──────────────┐
        │  PostgreSQL  │             │    Redis     │
        │  pg_app      │             │ (queue/cache)│
        │  schema: t_* │             └──────────────┘
        └──────────────┘
                              ▲
                              │
┌─────────────────────────────┴──────────────────────────────┐
│                control-plane (NestJS)                       │
│  • /tenants, /domains, /auth, /billing, /health             │
│  • Tenant provision, suspend, export, delete                │
└─────────────────────────────┬──────────────────────────────┘
                              │
                              ▼
                      ┌──────────────┐
                      │  PostgreSQL  │
                      │  pg_control  │
                      │  schema: pub │
                      └──────────────┘
```

## 5. Çapraz Kesişen Endişeler

- **KVKK:** `packages/observability/kvkk` modülü e-posta, telefon, TCKN, adres maskeleme.
- **Gözlemlenebilirlik:** Tüm servisler `pino` ile yapısal loglar üretir; OpenTelemetry exporter hazır.
- **Güvenlik:** Helmet, CORS allowlist, rate-limit, body boyut sınırı, Zod ile env doğrulama.

## 6. Dağıtım

- Her uygulama multi-stage Dockerfile ile inşa edilir.
- Altyapı servisleri (Postgres, Redis, MinIO, MailHog) `docker-compose` ile ayağa kaldırılır.
- Üretim compose dosyası `infra/coolify/docker-compose.prod.yml` ile Coolify'e yüklenebilir.

---

**Karar referansı:** `docs/adr/ADR-001-multitenancy.md`
**Sürüm:** 0.1.0 (Faz 1)
