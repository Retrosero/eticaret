/**
 * Yerel disk tabanlı depolama sürücüsü.
 *
 * - Geliştirme ve test ortamı için
 * - Dosyalar `baseDir` altına tenant_id/mantıksal-yol/dosya yapısında yazılır
 * - İmzalı URL desteği: HTTP `?token=...&exp=...` query token ile HMAC doğrulama
 * - Üretimde S3 sürücüsü kullanılır
 *
 * @module local
 */

import { promises as fs } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHmac, randomUUID } from 'node:crypto';

import type {
  StoredObject,
  StorageDriver,
  UploadInput,
  UploadResult,
  SignedUrlOptions,
} from '../types.js';
import { sanitizeFilename, buildStorageKey } from '../sanitize.js';

/** Yerel sürücü yapılandırması. */
export interface LocalStorageConfig {
  /** Kök dizin. */
  baseDir: string;
  /** URL imzaları için paylaşılan secret. */
  signingSecret: string;
  /** Public URL temeli (örn. http://localhost:9000/media). */
  publicBaseUrl: string;
}

/** Yerel sürücü. */
export class LocalStorageDriver implements StorageDriver {
  public readonly name = 'local';
  private readonly baseDir: string;
  private readonly signingSecret: string;
  private readonly publicBaseUrl: string;

  constructor(cfg: LocalStorageConfig) {
    if (!cfg.signingSecret || cfg.signingSecret.length < 16) {
      throw new Error('LocalStorageDriver: signingSecret en az 16 karakter olmalı.');
    }
    this.baseDir = resolve(cfg.baseDir);
    this.signingSecret = cfg.signingSecret;
    this.publicBaseUrl = cfg.publicBaseUrl.replace(/\/$/, '');
  }

  /** Güvenli anahtar → gerçek dosya yolu. */
  private resolveKeyPath(key: string): string {
    if (!key.startsWith('tenants/')) {
      throw new Error(`Geçersiz anahtar: ${key}`);
    }
    const full = join(this.baseDir, key);
    if (!full.startsWith(this.baseDir + '/') && full !== this.baseDir) {
      throw new Error('Path traversal tespit edildi.');
    }
    return full;
  }

  /** Tokenize edilmiş path. */
  private signToken(key: string, expSeconds: number, purpose: 'get' | 'put'): string {
    const payload = `${purpose}|${key}|${expSeconds}`;
    return createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('hex');
  }

  /** Dosya adına göre MIME tipi tahmini. */
  static inferContentType(filename: string, fallback: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    return fallback || 'application/octet-stream';
  }

  /** Buffer'a dönüştür. */
  private async toBuffer(input: Buffer | Readable): Promise<Buffer> {
    if (Buffer.isBuffer(input)) return input;
    const chunks: Buffer[] = [];
    for await (const c of input) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    }
    return Buffer.concat(chunks);
  }

  async put(input: UploadInput): Promise<UploadResult> {
    const key = buildStorageKey(input.tenantId, input.logicalPath, input.filename);
    const filePath = this.resolveKeyPath(key);

    // Boyut kontrolü
    if (input.maxBytes !== undefined) {
      const buf = await this.toBuffer(input.body);
      if (buf.byteLength > input.maxBytes) {
        throw new Error(
          `Dosya boyutu (${buf.byteLength}) sınırı (${input.maxBytes}) aşıyor.`,
        );
      }
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buf);
      const stat = await fs.stat(filePath);
      return { key, size: stat.size, contentType: input.contentType };
    }

    // Akış olarak yaz
    await fs.mkdir(dirname(filePath), { recursive: true });
    const body = Buffer.isBuffer(input.body)
      ? Readable.from([input.body])
      : input.body;
    await pipeline(body, createWriteStream(filePath));

    const stat = await fs.stat(filePath);
    return { key, size: stat.size, contentType: input.contentType };
  }

  async get(key: string): Promise<{ stream: Readable; meta: StoredObject }> {
    const filePath = this.resolveKeyPath(key);
    const stat = await fs.stat(filePath);
    return {
      stream: createReadStream(filePath),
      meta: {
        key,
        size: stat.size,
        contentType: LocalStorageDriver.inferContentType(key, 'application/octet-stream'),
        createdAt: stat.birthtimeMs,
        etag: `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`,
      },
    };
  }

  async remove(key: string): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.stat(this.resolveKeyPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async signedPutUrl(
    key: string,
    contentType: string,
    ttlSeconds = 600,
  ): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = this.signToken(key, exp, 'put');
    const qs = new URLSearchParams({ exp: String(exp), token, ct: contentType });
    return `${this.publicBaseUrl}/_storage/put/${encodeURIComponent(key)}?${qs.toString()}`;
  }

  async signedGetUrl(key: string, opts: SignedUrlOptions = {}): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 600);
    const token = this.signToken(key, exp, 'get');
    const qs = new URLSearchParams({ exp: String(exp), token });
    if (opts.disposition === 'attachment' && opts.downloadFilename) {
      qs.set('dl', sanitizeFilename(opts.downloadFilename));
    }
    return `${this.publicBaseUrl}/${key}?${qs.toString()}`;
  }

  /** Token doğrulama. */
  verifyToken(key: string, exp: number, token: string, purpose: 'get' | 'put'): boolean {
    if (exp < Math.floor(Date.now() / 1000)) return false;
    const expected = this.signToken(key, exp, purpose);
    if (expected.length !== token.length) return false;
    // Zamanlama saldırısına karşı sabit zamanlı karşılaştırma
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return diff === 0;
  }

  async list(prefix: string, limit = 100): Promise<ReadonlyArray<StoredObject>> {
    const dir = this.resolveKeyPath(prefix);
    const out: StoredObject[] = [];
    async function walk(current: string, base: string, acc: StoredObject[]): Promise<void> {
      const ents = await fs.readdir(current, { withFileTypes: true });
      for (const ent of ents) {
        const full = join(current, ent.name);
        if (ent.isDirectory()) {
          await walk(full, base, acc);
          if (acc.length >= limit) return;
        } else if (ent.isFile()) {
          const stat = await fs.stat(full);
          const rel = full.substring(base.length + 1).replace(/\\/g, '/');
          acc.push({
            key: rel,
            size: stat.size,
            contentType: LocalStorageDriver.inferContentType(ent.name, 'application/octet-stream'),
            createdAt: stat.birthtimeMs,
            etag: `"${stat.mtimeMs.toString(16)}"`,
          });
          if (acc.length >= limit) return;
        }
      }
    }
    try {
      await walk(dir, this.baseDir, out);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') throw err;
    }
    return out;
  }
}

/** Factory: env'den okur. */
export function createLocalStorage(env: {
  LOCAL_STORAGE_DIR: string;
  STORAGE_SIGNING_SECRET: string;
  STORAGE_PUBLIC_BASE_URL: string;
}): LocalStorageDriver {
  return new LocalStorageDriver({
    baseDir: env.LOCAL_STORAGE_DIR,
    signingSecret: env.STORAGE_SIGNING_SECRET,
    publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL,
  });
}

// uuid yardımcı re-export (modül bağımlılığı).
export { randomUUID };
