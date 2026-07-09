# API Genel Bakış

Tüm API'ler **OpenAPI 3.x** ile tanımlanır. Üretimde Swagger UI
yayınlanır.

## Genel Sözleşme

Tüm endpoint'ler JSON ile iletişir ve şu zarfı kullanır:

```json
{
  "success": true,
  "data": { ... }
}
```

Hata yanıtları:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "İstek gövdesi doğrulaması başarısız.",
    "details": { "fieldErrors": { "email": ["Geçersiz"] } }
  }
}
```

Tüm hata kodları `@eticart/config/errors` modülünde listelidir.

## Standart Başlıklar

Yanıtta:

- `X-Request-Id` — dağıtık izleme
- `X-Correlation-Id` — dağıtık izleme

İstekte:

- `Authorization: Bearer <token>` (Faz 3)
- `X-Request-Id` (opsiyonel; yoksa yeni UUID atanır)

## Endpoint Listesi

### Control Plane (`apps/control-plane`)

- `GET /api/v1/health` — liveness
- `GET /api/v1/ready` — readiness (DB + Redis)
- `GET /api/v1/tenants/ping` — Faz 1 placeholder

### Commerce Backend (`apps/commerce-backend`)

- `GET /health`, `GET /ready` — özel
- `/store/*`, `/admin/products`, `/admin/orders` — Medusa (Faz 4+)

### Frontends (`storefront`, `tenant-admin`, `super-admin`)

- `GET /health`, `GET /ready` — özel

## Yayın (Swagger)

Üretimde: `https://api.example.com/docs` üzerinden kontrol düzlemi
API'sinin tam referansı paylaşılır.
