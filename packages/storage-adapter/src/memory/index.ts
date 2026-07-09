/**
 * Bellek içi depolama sürücüsü — birim testleri ve hızlı prototipleme için.
 * Tüm nesneler `Map` içinde tutulur; süreç sonlandığında kaybolur.
 */

import { Readable } from 'node:stream';

import type {
  SignedUrlOptions,
  StorageDriver,
  StoredObject,
  UploadInput,
  UploadResult,
} from '../types.js';
import { buildStorageKey, sanitizeFilename } from '../sanitize.js';

interface InternalObject extends StoredObject {
  data: Buffer;
}

/** Bellek içi sürücü. */
export class InMemoryStorageDriver implements StorageDriver {
  public readonly name = 'memory';
  private readonly objects = new Map<string, InternalObject>();

  private key(input: Pick<UploadInput, 'tenantId' | 'logicalPath' | 'filename'>): string {
    return buildStorageKey(input.tenantId, input.logicalPath, input.filename);
  }

  private toBuffer(input: Buffer | Readable): Promise<Buffer> {
    if (Buffer.isBuffer(input)) return Promise.resolve(input);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const r = input;
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => resolve(Buffer.concat(chunks)));
      r.on('error', reject);
    });
  }

  async put(input: UploadInput): Promise<UploadResult> {
    const key = this.key(input);
    const buf = await this.toBuffer(input.body);
    if (input.maxBytes !== undefined && buf.byteLength > input.maxBytes) {
      throw new Error(
        `Dosya boyutu (${buf.byteLength}) sınırı (${input.maxBytes}) aşıyor.`,
      );
    }
    this.objects.set(key, {
      key,
      data: buf,
      size: buf.byteLength,
      contentType: input.contentType,
      createdAt: Date.now(),
      etag: `"${buf.byteLength.toString(16)}"`,
    });
    return { key, size: buf.byteLength, contentType: input.contentType };
  }

  async get(key: string): Promise<{ stream: Readable; meta: StoredObject }> {
    const obj = this.objects.get(key);
    if (!obj) {
      throw new Error(`Nesne bulunamadı: ${key}`);
    }
    const { data, ...meta } = obj;
    void data;
    return { stream: Readable.from([obj.data]), meta };
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async signedPutUrl(
    key: string,
    contentType: string,
    ttlSeconds = 600,
  ): Promise<string> {
    void contentType;
    void ttlSeconds;
    return `memory://put/${key}`;
  }

  async signedGetUrl(
    key: string,
    opts: SignedUrlOptions = {},
  ): Promise<string> {
    void opts;
    return `memory://get/${key}`;
  }

  async list(prefix: string, limit = 100): Promise<ReadonlyArray<StoredObject>> {
    const out: StoredObject[] = [];
    for (const obj of this.objects.values()) {
      if (!obj.key.startsWith(prefix)) continue;
      const { data, ...meta } = obj;
      void data;
      out.push(meta);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Test için yardımcı: tüm depoyu temizle. */
  clear(): void {
    this.objects.clear();
  }

  /** Test için: doğrudan erişim. */
  rawAll(): ReadonlyMap<string, InternalObject> {
    return this.objects;
  }
}

/** Dosya adı yardımcısı yeniden dışa aktarımı. */
export { sanitizeFilename };
