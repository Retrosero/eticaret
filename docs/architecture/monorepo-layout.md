# Mimari — Monorepo Düzeni

## Amaç

Faz 1'de kurulan monorepo, Faz 2-9'un ihtiyaç duyacağı tüm paylaşılan
modülleri barındıracak şekilde tasarlandı.

## `apps/` — Çalıştırılabilir Uygulamalar

| Klasör             | Sorumluluk                              | Teknoloji           |
|--------------------|------------------------------------------|---------------------|
| `storefront`       | Tenant domain'e göre müşteri vitrini    | Next.js App Router  |
| `tenant-admin`     | Mağaza yöneticisinin paneli             | Next.js App Router  |
| `super-admin`      | SaaS süper admin paneli                 | Next.js App Router  |
| `commerce-backend` | E-ticaret çekirdeği (ürün, sipariş, vs.)| Medusa              |
| `control-plane`    | Tenant yaşam döngüsü, kimlik             | NestJS              |

## `packages/` — Paylaşılan Kütüphaneler

| Paket                | Kullanım Alanı                              | Faz |
|----------------------|---------------------------------------------|-----|
| `@eticart/config`    | Logger, hata modeli, env, response sözleşmesi| 1   |
| `@eticart/shared-types` | API kontratları, ortak tipler             | 1   |
| `@eticart/validation`| Zod şemaları                                | 1   |
| `@eticart/tenant-context` | Domain → tenant çözümleme             | 1-2 |
| `@eticart/auth`      | JWT, RBAC                                   | 3   |
| `@eticart/observability` | OpenTelemetry, Sentry, KVKK maskeleme  | 1-5 |
| `@eticart/payment-adapters` | iyzico, PayTR, Param                | 6   |
| `@eticart/shipping-adapters` | Yurtiçi, Aras, MNG                | 6   |
| `@eticart/notification-adapters` | SMS, e-posta                  | 9   |
| `@eticart/theme-engine` | Tenant teması değişkenleri              | 5   |
| `@eticart/ui`        | Erişilebilir ortak bileşenler               | 5   |
| `@eticart/tsconfig`  | Paylaşılan TypeScript ayarları              | 1   |
| `@eticart/eslint-config` | Paylaşılan ESLint kuralları            | 1   |

## Bağımlılık Yönü

İç bağımlılıklar yalnızca şu yönde olmalıdır:

```
apps/* → packages/*
packages/* → packages/* (sadece config, shared-types, validation, tsconfig, eslint-config)
```

Döngüsel bağımlılık **kesinlikle yasaktır**. Turborepo,
package sıralamasını `^build` ile takip eder.

## Çapraz Bağımlılık Kuralları

- `@eticart/config` her şeyden bağımsızdır (en altta).
- `@eticart/shared-types` yalnızca tip düzeyinde — runtime yok.
- `@eticart/validation` yalnızca `@eticart/shared-types`'a bağlı.
- `@eticart/tenant-context` Faz 2+ ile `@eticart/shared-types`'ı kullanır.

## Build Sıralaması

```
1. tsconfig, eslint-config        (yapılandırma)
2. config, shared-types           (temel)
3. validation, observability      (türetilmiş)
4. tenant-context, auth, theme-engine, ui
   payment/shipping/notification-adapters
5. infra-scripts                  (migration, seed)
6. apps/*                         (uygulamalar)
```
