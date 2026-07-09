/**
 * Storage adaptörü ortak tipleri.
 *
 * Tüm sürücüler (Local, S3, InMemory) bu interface'i uygular.
 * Üst katman yalnızca bu tip üzerinden sürücü ile konuşur.
 */

import { Readable } from 'node:stream';
import type { Uuid } from '@eticart/shared-types';

/** Yüklenebilecek içerik tipleri. */
export type SupportedMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'image/svg+xml'
  | 'video/mp4'
  | 'application/pdf'
  | 'application/octet-stream';

/** Bir depolama nesnesinin meta verileri. */
export interface StoredObject {
  /** Tenant içi benzersiz anahtar; örn. `tenants/<uuid>/products/<sku>/cover.jpg` */
  key: string;
  /** Bayt cinsinden boyut. */
  size: number;
  /** MIME tipi. */
  contentType: string;
  /** Oluşturulma zamanı (ms epoch). */
  createdAt: number;
  /** Varsa sunucu tarafı ETag. */
  etag?: string;
}

/** Yükleme için giriş. */
export interface UploadInput {
  /** Tenant kimliği — tüm anahtarlar bu prefix ile başlar. */
  tenantId: Uuid;
  /** Nesnenin uygulama içi mantıksal yolu (örn. `products/<sku>/cover`). */
  logicalPath: string;
  /** Uygulama tarafından üretilen dosya adı (uzantı dahil). */
  filename: string;
  /** Akış veya Buffer. */
  body: Buffer | Readable;
  /** MIME tipi. */
  contentType: SupportedMime | string;
  /** Tür için izin verilen maksimum boyut (bayt). Opsiyonel. */
  maxBytes?: number;
}

/** Yükleme sonucu. */
export interface UploadResult {
  key: string;
  size: number;
  contentType: string;
  etag?: string;
}

/** İmzalı URL üretim parametreleri. */
export interface SignedUrlOptions {
  /** TTL saniye. Varsayılan 600 (10 dakika). */
  ttlSeconds?: number;
  /** Yanıt zorla inecekse `attachment`, tarayıcıda açılacaksa `inline`. */
  disposition?: 'inline' | 'attachment';
  /** İndirilecek dosya adı (Content-Disposition için). */
  downloadFilename?: string;
}

/** Ortak sürücü interface'i. */
export interface StorageDriver {
  /** Sürücü adı (log için). */
  readonly name: string;
  /** Nesne yükle. */
  put(input: UploadInput): Promise<UploadResult>;
  /** Nesneyi oku. */
  get(key: string): Promise<{ stream: Readable; meta: StoredObject }>;
  /** Nesneyi sil. */
  remove(key: string): Promise<void>;
  /** Nesnenin var olup olmadığını sorgula. */
  exists(key: string): Promise<boolean>;
  /** Geçici PUT URL'i (doğrudan istemci PUT için). */
  signedPutUrl(key: string, contentType: string, ttlSeconds?: number): Promise<string>;
  /** Geçici GET URL'i (görüntüleme için). */
  signedGetUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  /** Listeleme (sayfalama opsiyonel). */
  list(prefix: string, limit?: number): Promise<ReadonlyArray<StoredObject>>;
}
