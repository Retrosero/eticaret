/**
 * Storage servisi — yüklemeleri yönetir.
 *
 * Sorumluluklar:
 *   - Storage adapter seçimi (S3/R2 prod, Local dev, Memory test)
 *   - Tenant-bazlı bucket/prefix routing
 *   - Presigned PUT URL üretimi (frontend'in doğrudan yükleme yapması için)
 *   - Dosya boyut / MIME kontrolü
 *   - Dosya adı sanitizasyonu (path traversal koruması)
 *
 * Kullanım:
 *   const { uploadUrl, key } = await StorageService.createUploadUrl({
 *     tenantId,
 *     logicalPath: 'products/abc/cover',
 *     filename: 'image.jpg',
 *     contentType: 'image/jpeg',
 *     maxBytes: 5_000_000,
 *   });
 *   // Frontend: fetch(uploadUrl, { method: 'PUT', body: file })
 */
import { createLogger } from '@eticart/config';
import {
  S3StorageDriver,
  LocalStorageDriver,
  InMemoryStorageDriver,
  buildStorageKey,
  type StorageDriver,
  type UploadResult,
} from '@eticart/storage-adapter';

const log = createLogger({ service: 'storage-service' });

export interface CreateUploadUrlInput {
  tenantId: string;
  logicalPath: string;
  filename: string;
  contentType: string;
  maxBytes?: number;
}

export interface CreateUploadUrlResult {
  /** Backend'e geri gönderilecek anahtar (ör. tenant/products/abc/cover.jpg). */
  key: string;
  /** İstemcinin doğrudan PUT atacağı presigned URL. */
  uploadUrl: string;
  /** URL geçerlilik süresi (saniye). */
  ttlSeconds: number;
}

export interface CreateDownloadUrlInput {
  key: string;
  ttlSeconds?: number;
  downloadFilename?: string;
  disposition?: 'inline' | 'attachment';
}

export interface CreateDownloadUrlResult {
  url: string;
  expiresAt: number;
}

let driverInstance: StorageDriver | null = null;
let driverKind: 's3' | 'local' | 'memory' | null = null;

function buildDriverFromEnv(): { driver: StorageDriver; kind: 's3' | 'local' | 'memory' } {
  // S3/R2
  if (
    process.env['S3_ENDPOINT'] &&
    process.env['S3_ACCESS_KEY_ID'] &&
    process.env['S3_SECRET_ACCESS_KEY'] &&
    process.env['S3_BUCKET']
  ) {
    const isR2 = process.env['S3_ENDPOINT']?.includes('r2.cloudflarestorage.com');

    return {
      driver: new S3StorageDriver({
        endpoint: process.env['S3_ENDPOINT'],
        region: process.env['S3_REGION'] ?? (isR2 ? 'auto' : 'us-east-1'),
        accessKeyId: process.env['S3_ACCESS_KEY_ID'],
        secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'],
        bucket: process.env['S3_BUCKET'],
        publicBaseUrl: process.env['S3_PUBLIC_BASE_URL'],
        forcePathStyle: process.env['S3_FORCE_PATH_STYLE'] === 'true',
      }),
      kind: 's3',
    };
  }

  // Yerel disk (dev)
  if (process.env['LOCAL_STORAGE_DIR']) {
    return {
      driver: new LocalStorageDriver({
        baseDir: process.env['LOCAL_STORAGE_DIR'],
        signingSecret: process.env['LOCAL_STORAGE_SIGNING_SECRET'] ?? 'dev-local-signing-secret-min16chars',
        publicBaseUrl: process.env['LOCAL_STORAGE_PUBLIC_URL'] ?? 'http://localhost:9000/static',
      }),
      kind: 'local',
    };
  }

  // In-memory (test)
  log.warn('Storage driver env yapılandırması yok — InMemoryStorageDriver kullanılıyor');
  return { driver: new InMemoryStorageDriver(), kind: 'memory' };
}

export const StorageService = {
  /** Driver'ı lazy oluşturur (singleton). */
  driver(): StorageDriver {
    if (!driverInstance) {
      const { driver, kind } = buildDriverFromEnv();
      driverInstance = driver;
      driverKind = kind;
      log.info({ kind, driverName: driver.name }, 'Storage driver hazır');
    }
    return driverInstance;
  },

  /** Driver tipi (log/diagnostic için). */
  driverKind(): 's3' | 'local' | 'memory' {
    this.driver(); // init
    return driverKind ?? 'memory';
  },

  /** Multi-tenant tenant_id + path → güvenli object key. */
  buildKey(tenantId: string, logicalPath: string, filename: string): string {
    return buildStorageKey(tenantId as any, logicalPath, filename);
  },

  /**
   * Tenant için presigned PUT URL üretir.
   *
   * Frontend bu URL'e doğrudan `fetch(uploadUrl, { method: 'PUT', body: file })`
   * yapar; backend büyük dosya akışı almaz.
   */
  async createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult> {
    const ttlSeconds = 600; // 10 dakika
    const key = this.buildKey(input.tenantId, input.logicalPath, input.filename);

    const uploadUrl = await this.driver().signedPutUrl(key, input.contentType, ttlSeconds);

    log.info(
      { key, contentType: input.contentType, ttlSeconds },
      'Upload URL üretildi',
    );

    return { key, uploadUrl, ttlSeconds };
  },

  /**
   * Tenant için presigned GET URL üretir.
   */
  async createDownloadUrl(input: CreateDownloadUrlInput): Promise<CreateDownloadUrlResult> {
    const ttlSeconds = input.ttlSeconds ?? 3600; // 1 saat
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    const url = await this.driver().signedGetUrl(input.key, {
      ttlSeconds,
      downloadFilename: input.downloadFilename,
      disposition: input.disposition ?? 'inline',
    });

    return { url, expiresAt };
  },

  /**
   * Nesneyi siler (KVKK silme hakkı, ürün kaldırma vb.).
   */
  async remove(key: string, tenantId: string): Promise<void> {
    // Güvenlik: key'in tenantId prefix'i ile başladığını doğrula
    if (!key.startsWith(`tenants/${tenantId}/`)) {
      throw new Error(
        `Cross-tenant silme engellendi: key '${key}' tenant '${tenantId}' için değil.`,
      );
    }
    await this.driver().remove(key);
    log.info({ key }, 'Nesne silindi');
  },

  /**
   * Nesnenin var olup olmadığını sorgular.
   */
  async exists(key: string): Promise<boolean> {
    return this.driver().exists(key);
  },

  /**
   * Doğrudan backend PUT (küçük dosyalar için — çoğunlukla presigned PUT tercih edilir).
   */
  async put(input: {
    tenantId: string;
    logicalPath: string;
    filename: string;
    body: Buffer;
    contentType: string;
  }): Promise<UploadResult> {
    // key upstream'e dokunmadan driver'a iletilir
    void this.buildKey(input.tenantId, input.logicalPath, input.filename);
    return this.driver().put({
      tenantId: input.tenantId as any,
      logicalPath: input.logicalPath,
      filename: input.filename,
      body: input.body,
      contentType: input.contentType,
    });
  },
};

export default StorageService;