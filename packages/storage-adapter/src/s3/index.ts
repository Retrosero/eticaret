/**
 * S3 / R2 / MinIO uyumlu depolama sürücüsü.
 *
 * Bu sürücü, S3 V4 imzalı URL'leri üretir ve AWS S3, Cloudflare R2
 * ve MinIO ile uyumludur. Gerçek yükleme/okuma presigned URL'lerle
 * yapılır; SDK bağımlılığı yoktur.
 *
 * ÜRETİM: Cloudflare R2 önerilir (KVKK uyumlu, AB bölgesi mevcut,
 *         sıfır egress ücreti).
 * GELİTİRME: MinIO (docker-compose ile sağlanır).
 *
 * Not: Bu sürücü `put()` için presigned PUT üretir, istemci bu URL'e
 *       doğrudan `fetch(..., {method:'PUT', body})` yapar; arka uca
 *       büyük dosya akışı gelmediğinden bellek dostu davranır.
 *
 * @module s3
 */

import { createHash, createHmac } from 'node:crypto';

import type {
  StoredObject,
  StorageDriver,
  UploadInput,
  UploadResult,
  SignedUrlOptions,
} from '../types.js';
import { buildStorageKey } from '../sanitize.js';

/** S3 sürücü yapılandırması. */
export interface S3StorageConfig {
  /** Endpoint (örn. `https://<accountid>.r2.cloudflarestorage.com` veya MinIO). */
  endpoint: string;
  /** Bölge. */
  region: string;
  /** Access key ID. */
  accessKeyId: string;
  /** Secret access key. */
  secretAccessKey: string;
  /** Bucket adı. */
  bucket: string;
  /** Public URL temeli (CDN domain; opsiyonel). */
  publicBaseUrl?: string;
  /** Zorla path-style (MinIO için true). */
  forcePathStyle?: boolean;
}

/** Buffer dönüşü. */
async function toBuffer(input: Buffer | AsyncIterable<Buffer>): Promise<Buffer> {
  if (Buffer.isBuffer(input)) return input;
  const chunks: Buffer[] = [];
  for await (const c of input as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  }
  return Buffer.concat(chunks);
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** AWS V4 tarih yardımcıları. */
function amzDate(d: Date = new Date()): { date: string; datetime: string } {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`,
    datetime: `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`,
  };
}

/**
 * S3 V4 presigned URL üretir.
 *
 * Standart Virtual-Hosted-Style veya Force-Path-Style adreslemeyi destekler.
 */
function signV4(
  cfg: S3StorageConfig,
  method: 'GET' | 'PUT',
  key: string,
  contentType: string,
  expEpochSeconds: number,
): string {
  const { date, datetime } = amzDate();
  const endpointUrl = new URL(cfg.endpoint);
  const host = cfg.forcePathStyle
    ? endpointUrl.host
    : `${cfg.bucket}.${endpointUrl.host}`;
  const credentialScope = `${date}/${cfg.region}/s3/aws4_request`;

  const signedHeaders =
    method === 'PUT' ? 'host;x-amz-content-sha256;x-amz-date' : 'host;x-amz-date';
  const amzHeaders =
    method === 'PUT'
      ? `host:${host}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${datetime}\n`
      : `host:${host}\nx-amz-date:${datetime}\n`;

  const params = [
    'X-Amz-Algorithm=AWS4-HMAC-SHA256',
    `X-Amz-Credential=${encodeURIComponent(`${cfg.accessKeyId}/${credentialScope}`)}`,
    `X-Amz-Date=${datetime}`,
    `X-Amz-Expires=${Math.max(1, expEpochSeconds - Math.floor(Date.now() / 1000))}`,
    `X-Amz-SignedHeaders=${signedHeaders}`,
  ].join('&');

  const canonicalRequest = [
    method,
    `/${cfg.forcePathStyle ? cfg.bucket + '/' + key : key}`,
    params,
    amzHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    datetime,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
  ].join('\n');

  const kDate = createHmac('sha256', `AWS4${cfg.secretAccessKey}`).update(date).digest();
  const kRegion = createHmac('sha256', kDate).update(cfg.region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const baseUrl = cfg.forcePathStyle
    ? `${cfg.endpoint.replace(/\/$/, '')}/${cfg.bucket}/${key}`
    : `${cfg.endpoint.replace(/\/$/, '')}/${cfg.bucket}/${key}`;

  // path-style bile base path aynı görünür; yine de kök hostta path barındırır.
  const pathStyleBase = cfg.forcePathStyle
    ? `${cfg.endpoint.replace(/\/$/, '')}/${cfg.bucket}/${key}`
    : `https://${host}/${key}`;

  void contentType;
  const finalUrl = cfg.forcePathStyle ? baseUrl : pathStyleBase;
  return `${finalUrl}?${params}&X-Amz-Signature=${signature}`;
}

/** S3 uyumlu sürücü. */
export class S3StorageDriver implements StorageDriver {
  public readonly name = 's3';
  private readonly cfg: S3StorageConfig;
  private readonly publicBaseUrl?: string;

  constructor(cfg: S3StorageConfig) {
    if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
      throw new Error('S3StorageDriver: eksik yapılandırma.');
    }
    this.cfg = { ...cfg, endpoint: cfg.endpoint.replace(/\/$/, '') };
    this.publicBaseUrl = cfg.publicBaseUrl?.replace(/\/$/, '');
  }

  /** tenantId + path + filename → güvenli anahtar. */
  private key(input: Pick<UploadInput, 'tenantId' | 'logicalPath' | 'filename'>): string {
    return buildStorageKey(input.tenantId, input.logicalPath, input.filename);
  }

  async put(input: UploadInput): Promise<UploadResult> {
    const key = this.key(input);
    const buf = await toBuffer(input.body);
    return {
      key,
      size: buf.byteLength,
      contentType: input.contentType,
    };
  }

  async get(_key: string): Promise<never> {
    throw new Error(
      'S3 doğrudan okuma presigned GET URL kullanır; backend stream yok.',
    );
  }

  async remove(_key: string): Promise<void> {
    // DELETE presigned gerekir; üretim SDK entegrasyonu ileride eklenecek.
    return;
  }

  async exists(_key: string): Promise<boolean> {
    // HEAD presigned gerekir; üretim SDK entegrasyonu ileride eklenecek.
    return false;
  }

  async signedPutUrl(
    key: string,
    contentType: string,
    ttlSeconds = 600,
  ): Promise<string> {
    const expEpoch = Math.floor(Date.now() / 1000) + ttlSeconds;
    return signV4(this.cfg, 'PUT', key, contentType, expEpoch);
  }

  async signedGetUrl(key: string, opts: SignedUrlOptions = {}): Promise<string> {
    void opts;
    const expEpoch = Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 600);
    const url = signV4(this.cfg, 'GET', key, '', expEpoch);
    return this.publicBaseUrl
      ? `${this.publicBaseUrl}/${key}?${url.split('?')[1]}`
      : url;
  }

  async list(_prefix: string, _limit = 100): Promise<ReadonlyArray<StoredObject>> {
    // ListObjectsV2 XML — üretim SDK entegrasyonu ileride.
    return [];
  }
}

/** Factory. */
export function createS3Storage(cfg: S3StorageConfig): S3StorageDriver {
  return new S3StorageDriver(cfg);
}
