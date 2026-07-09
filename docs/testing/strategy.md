# Test Stratejisi

## Seviyeler

### 1. Smoke testleri (Faz 1 — her paket için bir tane)

- Her paket en az bir "uygulama yüklenebilir mi?" testi içerir.
- `apps/control-plane`: HTTP `/health` ve `/ready` çağrıları.
- `apps/storefront`, `tenant-admin`, `super-admin`: build sırasında sayfa üretimi.
- `@eticart/config`: API imzaları, maskeleme, ID sanitization.

### 2. Birim testleri (Faz 2+)

- Domain sanitization (`@eticart/tenant-context`)
- KVKK maskeleme (`@eticart/observability/kvkk`)
- Zod şemaları (`@eticart/validation`)
- Logger redaction (`@eticart/config`)

### 3. Entegrasyon testleri (Faz 2+)

- Gerçek Postgre + Redis (docker-compose test profili)
- Tenant provision senaryoları
- 19 testten oluşan izolasyon matrisinin tekrarlanması

### 4. Uçtan uca (Faz 4+)

- Vitrin sipariş akışı (Playwright)
- Yönetim paneli CRUD

## Araçlar

- **Vitest** — unit + smoke (tüm `packages/*` ve NestJS entegrasyon)
- **Playwright** — e2e (Faz 4+)
- **Supertest** — HTTP endpoint testleri (NestJS)
- **k6 / Artillery** — yük testi (Faz 5+)

## KVKK Odaklı Testler

- `safeLog` ile kayıt altına alınan objelerde ham e-posta/telefon
  içermemeli.
- İmzalara aykırı `x-tenant-id` başlıkları görmezden gelinmeli.
- Üretim modunda hata yanıtlarında `stack` bulunmamalı.

## Çalıştırma

```bash
# Tüm paketler için smoke + unit
pnpm test

# Bir uygulama için
pnpm --filter @eticart/control-plane test

# Coverage
pnpm test:coverage
```

## CI

`pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build` her PR'da
otomatik çalışır (bkz. `.github/workflows/ci.yml`). Coverage raporu
PR yorumunda paylaşılır.
