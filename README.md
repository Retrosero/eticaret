# Türkçe E-Ticaret SaaS Platformu

> **Çok kiracılı (multi-tenant) Türkçe e-ticaret SaaS altyapısı.** Mağaza (Next.js), kontrol paneli (NestJS) ve e-ticaret çekirdeği (Medusa) tek bir monorepo altında.

---

## 🎯 Amaç

Her kiracının (tenant) kendi alan adı, kendi Postgre şeması ve kendi mağaza verileriyle izole biçimde çalıştığı, **KVKK uyumlu**, Türkçe ilk (Turkish-first) bir e-ticaret SaaS platformu kurmak.

ADR-001 (bkz. `docs/adr/ADR-001-multitenancy.md`) gereği **Seçenek B** benimsendi: ortak kontrol paneli + tenant başına izole mağaza (ayrı Postgre şeması + aynı uygulama imajı).

---

## 📦 Monorepo Yapısı

```
proje/
├── apps/                   # Çalıştırılabilir uygulamalar
│   ├── storefront/         # Müşteri vitrin (Next.js App Router)
│   ├── tenant-admin/       # Mağaza yönetim paneli (Next.js)
│   ├── super-admin/        # SaaS süper admin (Next.js)
│   ├── commerce-backend/   # E-ticaret çekirdeği (Medusa)
│   └── control-plane/      # SaaS kontrol düzlemi (NestJS)
├── packages/               # Paylaşılan paketler
│   ├── ui/                 # Ortak UI bileşenleri
│   ├── theme-engine/       # Tema motoru (Faz 5)
│   ├── shared-types/       # Ortak TypeScript tipleri
│   ├── validation/         # Zod/class-validator şemaları
│   ├── config/             # env, logger, hata modeli
│   ├── auth/               # Kimlik doğrulama yardımcıları
│   ├── tenant-context/     # Tenant çözümleme
│   ├── payment-adapters/   # iyzico, PayTR, Param (Faz 6)
│   ├── shipping-adapters/  # Kargo entegrasyonları (Faz 6)
│   ├── notification-adapters/ # SMS/E-posta (Faz 9)
│   ├── observability/      # OpenTelemetry, Sentry, pino
│   ├── eslint-config/      # Paylaşılan ESLint
│   └── tsconfig/           # Paylaşılan tsconfig temaları
├── infra/                  # Docker, migration, monitoring
├── docs/                   # Mimari, ADR, OpenAPI
└── .github/workflows/      # CI
```

---

## ⚙️ Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Monorepo | Turborepo + pnpm |
| Backend (e-ticaret) | Medusa (Node.js + TypeScript) |
| Backend (kontrol) | NestJS (TypeScript) |
| Frontend | Next.js App Router |
| Veritabanı | PostgreSQL 15+ |
| Önbellek / Kuyruk | Redis 7 |
| Dosya | Cloudflare R2 / S3 (MinIO ile simülasyon) |
| CI | GitHub Actions |
| Deploy | Docker + Coolify |

---

## 🚀 Hızlı Başlangıç

### Önkoşullar
- Node.js ≥ 20
- pnpm ≥ 9 (`corepack enable pnpm`)
- Docker + Docker Compose (yalnızca altyapı servislerini çalıştırmak için)

### Kurulum

```bash
# 1. Bağımlılıkları kur
pnpm install

# 2. Ortam değişkenlerini hazırla
cp .env.example .env

# 3. Altyapı servislerini ayağa kaldır (Postgres, Redis, MailHog, MinIO)
pnpm docker:dev

# 4. Geliştirme sunucularını başlat
pnpm dev
```

### Doğrulama

```bash
# Lint
pnpm lint

# Tür denetimi
pnpm type-check

# Test
pnpm test

# Build
pnpm build
```

---

## 🩺 Sağlık Kontrolleri

Her uygulama iki sağlık endpoint'i sunar:

- `GET /health` — **liveness**, süreç çalışıyor mu? (herhangi bir bağımlılık kontrol edilmez)
- `GET /ready` — **readiness**, kritik bağımlılıklar (PostgreSQL, Redis) yanıt veriyor mu?

Hazır olduklarında benzer JSON yanıtlar dönerler:

```json
{
  "status": "ok",
  "service": "control-plane",
  "version": "0.1.0",
  "timestamp": "2026-07-02T09:37:18.000Z"
}
```

---

## 🔐 Güvenlik

- Güvenli HTTP header'ları (Helmet) — `packages/config`'de merkezi yapılandırma
- CORS allowlist — env'den, `*` yasak
- Rate limit — `@nestjs/throttler` ile (kontrol düzlemi) + tenant bazlı altyapı
- Request body limiti — varsayılan 1 MB
- Environment doğrulama — uygulama başlamadan önce Zod ile
- Üretimde stack trace gizleme
- KVKK: kişisel veri loglanmaz — `packages/observability` içinde yardımcılar

---

## 📚 Dokümantasyon

| Belge | Yol |
|---|---|
| Mimari özet | `ARCHITECTURE.md` |
| Çok kiracılı karar | `docs/adr/ADR-001-multitenancy.md` |
| Dağıtım rehberi | `docs/deployment/` |
| API referansı | `docs/api/` |
| Veritabanı şeması | `docs/database/` |
| Test stratejisi | `docs/testing/` |
| Çalışma raporları | `FAZ-*-RAPORU.md` |

---

## 🗺️ Yol Haritası

- **Faz 0** ✅ Multi-tenant mimari kararı + PoC (ADR-001)
- **Faz 1** 🟢 Monorepo, altyapı, geliştirme ortamı (bu faz)
- **Faz 2** Tenant domain & routing
- **Faz 3** Kimlik & RBAC
- **Faz 4** Katalog & ürün
- **Faz 5** Tema & SEO
- **Faz 6** Ödeme & kargo
- **Faz 7** Sipariş & fatura
- **Faz 8** Raporlama
- **Faz 9** Bildirimler

---

## 📝 Lisans

UNLICENSED — Telif hakkı saklıdır.

---

**Hazırlayan:** Coder · **Tarih:** 2026-07-02 · **Sürüm:** 0.1.0 (Faz 1)
