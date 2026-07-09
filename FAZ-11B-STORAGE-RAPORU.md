# Faz 11B — Multi-tenant Storage (S3/R2/MinIO)

**Tarih:** 2026-07-06
**Süre:** ~1.5 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Multi-tenant SaaS platformunda tenant-bazlı dosya depolama altyapısı kurmak:
- **S3 / R2 / MinIO** uyumlu driver
- **Presigned PUT/GET URL** ile istemci-doğrudan yükleme (backend bellek dostu)
- **Multi-tenant izolasyon** (key prefix routing + cross-tenant silme engeli)
- **Path traversal koruması** (sanitize)
- **Storage controller** (backend REST API)

---

## 2. Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                     @eticart/storage-adapter                     │
├─────────────────────────────────────────────────────────────────┤
│  StorageDriver interface (ortak sözleşme)                        │
│   ├─ S3StorageDriver (AWS S3 / Cloudflare R2 / MinIO)            │
│   ├─ LocalStorageDriver (geliştirme / MinIO)                     │
│   ├─ InMemoryStorageDriver (test)                                │
│   └─ sanitize.ts (path traversal koruması, key üretimi)          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  apps/commerce-backend                           │
├─────────────────────────────────────────────────────────────────┤
│  modules/storage/                                                │
│   ├─ storage-service.ts    (singleton, lazy driver seçimi)       │
│   └─ storage.controller.ts (REST API)                            │
│                                                                  │
│  REST endpoint'leri:                                             │
│   ├─ POST  /api/admin/storage/upload-url   (presigned PUT)       │
│   ├─ POST  /api/admin/storage/download-url (presigned GET)       │
│   ├─ DELETE /api/admin/storage/:key        (nesne silme)         │
│   └─ GET    /api/admin/storage/health      (driver bilgisi)      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Bulut Storage (Prod)                            │
├─────────────────────────────────────────────────────────────────┤
│  - Cloudflare R2 (KVKK uyumlu, AB bölgesi, sıfır egress)         │
│  - AWS S3      (alternatif)                                      │
│  - MinIO       (self-hosted, geliştirme)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Storage Driver Detayları

### 3.1 S3StorageDriver (R2 / S3 / MinIO uyumlu)

- **AWS V4 imzalı URL** üretir (SDK bağımlılığı yok, ~150 satır)
- **Virtual-hosted-style** (AWS S3) ve **path-style** (MinIO) destekler
- **R2 endpoint** otomatik algılama (`*.r2.cloudflarestorage.com` → region='auto')

### 3.2 Multi-tenant Key Format

Tüm nesneler `tenants/<uuid>/<logical_path>/<filename>` formatında:

```
tenants/abc-123/products/abc-cover/cover.jpg
tenants/abc-123/customers/ali-yilmaz/kvkk-export-2026-07-06.zip
tenants/def-456/invoices/e-fatura-001.pdf
```

### 3.3 Multi-tenant İzolasyon Katmanları

1. **Key prefix kontrolü:** Her nesne `tenants/<tenant_id>/` ile başlar
2. **Cross-tenant silme engeli:** `StorageService.remove()` key prefix'i tenant_id ile eşleşmezse `Cross-tenant` hatası fırlatır
3. **Sanitize:** `../`, `\\`, boş segment → atlanır; sadece güvenli ASCII karakterler kabul
4. **Bucket CORS:** Sadece izinli origin'ler presigned URL çağırabilir

---

## 4. REST API

### 4.1 Upload URL

```http
POST /api/admin/storage/upload-url
Authorization: Bearer <jwt>
X-Tenant-Id: <uuid>
Content-Type: application/json

{
  "logicalPath": "products/abc/cover",
  "filename": "cover.jpg",
  "contentType": "image/jpeg",
  "maxBytes": 5000000  // opsiyonel, max 100MB
}
```

Yanıt:
```json
{
  "key": "tenants/abc-uuid/products/abc/cover/cover.jpg",
  "uploadUrl": "https://bucket.s3.region.amazonaws.com/...?X-Amz-Signature=...",
  "ttlSeconds": 600
}
```

Frontend:
```ts
const { uploadUrl, key } = await api.post('/admin/storage/upload-url', {...});
await fetch(uploadUrl, { method: 'PUT', body: file });
// key'i product.imageUrl olarak DB'ye kaydet
```

### 4.2 Download URL

```http
POST /api/admin/storage/download-url
{
  "key": "tenants/abc/products/cover.jpg",
  "ttlSeconds": 3600,
  "disposition": "inline",  // veya "attachment"
  "downloadFilename": "fatura.pdf"
}
```

### 4.3 DELETE

```http
DELETE /api/admin/storage/tenants%2Fabc%2Fproducts%2Fcover.jpg
{
  "tenantId": "abc-uuid"  // body'de
}
```

### 4.4 Health

```http
GET /api/admin/storage/health
→ { "driver": "s3", "driverName": "s3" }
```

---

## 5. Ortam Değişkenleri

### Production (Cloudflare R2 — önerilen)

```bash
S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<r2-token>
S3_SECRET_ACCESS_KEY=<r2-secret>
S3_BUCKET=eticart-prod-r2
S3_PUBLIC_BASE_URL=https://media.eticart.com.tr
```

### Development (MinIO)

```bash
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minio_admin
S3_SECRET_ACCESS_KEY=minio_change_me_min_8_chars
S3_BUCKET=eticart-storage
S3_FORCE_PATH_STYLE=true
```

### Test

Hiçbir env yok → `InMemoryStorageDriver` (otomatik fallback)

---

## 6. Test Sonuçları

### Storage Adapter (Vitest)

| Test dosyası | Test | Kapsam |
|--------------|------|--------|
| `src/sanitize.test.ts` | 8 | Path traversal, filename sanitization |
| `src/memory/memory.test.ts` | 4 | CRUD, signed URL |
| `src/image/image.test.ts` | 8 | Sharp boyutlandırma |
| `src/s3/s3.test.ts` | 15 | V4 imza, presigned URL, R2 uyumu, multi-tenant |
| **TOPLAM** | **35/35** ✅ | |

### Backend (Vitest)

| Modül | Test |
|------|------|
| `storage-service.test.ts` | 12 |
| Mevcut unit | 52 |
| Mevcut E2E | 19 |
| **TOPLAM** | **83/83** ✅ |

### Tüm paketler

| Paket | Test | Tip-hata |
|------|------|---------|
| commerce-backend (Vitest) | **83/83** ✅ | 0 |
| payment-adapters | 51/51 ✅ | - |
| shipping-adapters | 39/39 ✅ | - |
| storefront | 25/25 ✅ | - |
| einvoice-adapters | 13/13 ✅ | 0 |
| notification-adapters | 34/34 ✅ | 0 |
| **storage-adapter** | **35/35** ✅ | **0** |
| **TOPLAM** | **280/280** ✅ | **0** |

---

## 7. Bilinen Sınırlamalar / TODO

1. **S3 SDK entegrasyonu:** `get()`, `remove()`, `exists()`, `list()` şu an stub. Üretim SDK entegrasyonu (@aws-sdk/client-s3) Faz 11C+ kapsamında.
2. **Virus tarama:** Yüklenen dosyalar için ClamAV veya Cloudmersive taraması eklenebilir (Faz 12).
3. **Image resize on-the-fly:** Mevcut `image/index.ts` sharp kullanıyor, ama Next.js Image Optimization tarafı eklenmedi.
4. **CORS yönetimi UI:** Bucket CORS ayarları elle yapılıyor. Admin UI'dan yönetim (Faz 12+).
5. **Quota tracking:** Tenant başına GB limit (Faz 12+).

---

## 8. Kritik Dosya Yolları

```
packages/storage-adapter/
├── src/
│   ├── types.ts                     # StorageDriver interface, Upload/Download tipleri
│   ├── sanitize.ts                  # buildStorageKey + path traversal koruması
│   ├── s3/
│   │   ├── index.ts                 # S3StorageDriver (AWS V4 imzası)
│   │   └── s3.test.ts               # 15 test (V4 imza, R2, multi-tenant)
│   ├── local/index.ts               # LocalStorageDriver
│   ├── memory/index.ts              # InMemoryStorageDriver (test)
│   ├── image/index.ts               # Sharp boyutlandırma
│   └── index.ts                     # Re-export
└── package.json

apps/commerce-backend/
├── src/modules/storage/
│   ├── storage-service.ts           # Singleton + env-driven driver
│   ├── storage.controller.ts        # REST API
│   ├── storage.module.ts            # NestJS modül
│   └── __tests__/
│       └── storage-service.test.ts  # 12 test
└── src/app.module.ts                # StorageModule import

docker-compose.yml                   # MinIO servisi (geliştirme)
.env.production.example              # S3/R2 env'leri
DEPLOYMENT.md                        # 6.5 Storage bölümü (R2/MinIO kurulumu)
```