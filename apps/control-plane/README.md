# @eticart/control-plane

SaaS kontrol düzlemi — NestJS.

## Sorumluluk (Faz 2+)

- Tenant yaşam döngüsü (provision / suspend / export / delete)
- Domain yönetimi ve doğrulama
- Kimlik doğrulama (super admin)
- Faturalama & plan yönetimi
- KVKK denetim kayıtları

## Faz 1 kapsamı (bu commit)

- /health (liveness)
- /ready (readiness — gerçek DB/redis bağlantısı Faz 2'de)
- /api/v1/tenants/ping
- OpenAPI / Swagger UI
- Helmet + CORS allowlist + rate-limit + body limit
- Korelasyon kimliği + JSON loglama (pino)
- Global hata filtresi (ApiError ↔ standart JSON)

## Çalıştırma

```bash
# Geliştirme
pnpm --filter @eticart/control-plane dev

# Üretim build
pnpm --filter @eticart/control-plane build
pnpm --filter @eticart/control-plane start:prod
```

Ortam değişkenleri için `.env.example` dosyasına bakın.
