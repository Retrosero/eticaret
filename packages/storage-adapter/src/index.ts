/**
 * @eticart/storage-adapter
 *
 * S3/R2 uyumlu depolama adaptörü. Tüm `commerce-backend` modülleri
 * dosya yükleme/okuma için yalnızca bu paketi kullanır. Doğrudan S3
 * SDK çağrısı yapılmaz.
 *
 * Modüller:
 *  - `./local`     : Yerel disk tabanlı test sürücüsü
 *  - `./s3`        : S3 / R2 / MinIO uyumlu bulut sürücüsü
 *  - `./image`     : Görsel boyutlandırma (sharp)
 *
 * Güvenlik:
 *  - Tüm nesne adları tenant_id prefix'li üretilir; cross-tenant URL paylaşımı engellenir
 *  - S3 bucket public **değildir**; erişim imzalı URL (PUT / GET) ile sağlanır
 *  - MIME türü sürücü seviyesinde doğrulanır
 *  - Dosya adı sanitizasyonu path traversal saldırısını engeller
 *
 * @module storage-adapter
 */

export * from './types.js';
export * from './sanitize.js';
export * from './image/index.js';
export { LocalStorageDriver, createLocalStorage } from './local/index.js';
export { S3StorageDriver, createS3Storage } from './s3/index.js';
export { InMemoryStorageDriver } from './memory/index.js';
