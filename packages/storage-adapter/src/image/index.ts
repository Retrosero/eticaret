/**
 * Görsel işleme yardımcıları (sharp tabanlı).
 *
 *  - Çoklu boyut üretimi: küçük (200px), orta (600px), büyük (1200px), orijinal
 *  - Format dönüşümü: webp, jpeg, png
 *  - Akış tabanlı çalışır (büyük dosyalar için bellek dostu)
 *
 * @module image
 */

import sharp, { type FormatEnum } from 'sharp';

/** Ön tanımlı boyutlar (piksel, maksimum width). */
export const DEFAULT_SIZES = {
  small: 200,
  medium: 600,
  large: 1200,
} as const;

export type ImageSize = keyof typeof DEFAULT_SIZES | 'original';

/** Üretilen varyant meta verisi. */
export interface ResizeResult {
  /** Varyant adı (small/medium/large/original). */
  name: ImageSize;
  /** Çıktı buffer. */
  buffer: Buffer;
  /** Çıktı mime tipi. */
  mime: string;
  /** Çıktı boyutu (piksel). */
  width: number;
  /** Çıktı yüksekliği. */
  height: number;
  /** Bayt cinsinden. */
  size: number;
}

/** Yeniden boyutlandırma seçenekleri. */
export interface ResizeOptions {
  /** Hedef format; varsayılan orijinal formatta çıktı. */
  format?: keyof FormatEnum;
  /** Kalite (1-100), JPEG/WebP için. */
  quality?: number;
  /** Sıkıştırma "mozjpeg" vb. */
  compressionLevel?: number;
  /** Varyantlar listesi; varsayılan ['small','medium','large','original']. */
  sizes?: ReadonlyArray<ImageSize>;
  /** Çıktı genişliği sınırı (orijinal için). */
  withoutEnlargement?: boolean;
}

/**
 * Tek bir görsel verisinden çoklu varyant üretir.
 *
 * @example
 * ```ts
 * const variants = await resizeImageBuffer(buffer);
 * // → [{name:'small', buffer, mime:'image/webp', width:200, height:200}, ...]
 * ```
 */
export async function resizeImageBuffer(
  source: Buffer,
  opts: ResizeOptions = {},
): Promise<ResizeResult[]> {
  const sizes = opts.sizes ?? (['small', 'medium', 'large', 'original'] as const);
  const quality = opts.quality ?? 80;
  const format: keyof FormatEnum = opts.format ?? 'webp';

  const meta = await sharp(source).metadata();
  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.height ?? 0;

  const results: ResizeResult[] = [];

  for (const size of sizes) {
    if (size === 'original') {
      // Orijinal: yeniden kodlama yok (veya aynı formata sıkıştırma)
      const pipe = sharp(source, { failOn: 'error' });
      const buf =
        format === 'webp'
          ? await pipe.webp({ quality }).toBuffer()
          : format === 'jpeg'
            ? await pipe.jpeg({ quality }).toBuffer()
            : await pipe.toFormat(format).toBuffer();
      results.push({
        name: 'original',
        buffer: buf,
        mime: mimeFromFormat(format),
        width: srcWidth,
        height: srcHeight,
        size: buf.byteLength,
      });
      continue;
    }

    const maxW = DEFAULT_SIZES[size];
    const pipeline = sharp(source).rotate(); // EXIF yönü düzeltme
    const resized = pipeline.resize({
      width: maxW,
      withoutEnlargement: opts.withoutEnlargement ?? true,
    });

    const buf =
      format === 'webp'
        ? await resized.webp({ quality }).toBuffer()
        : format === 'jpeg'
          ? await resized.jpeg({ quality }).toBuffer()
          : await resized.toFormat(format).toBuffer();

    const outMeta = await sharp(buf).metadata();

    results.push({
      name: size,
      buffer: buf,
      mime: mimeFromFormat(format),
      width: outMeta.width ?? maxW,
      height: outMeta.height ?? maxW,
      size: buf.byteLength,
    });
  }

  return results;
}

/** Format adından MIME tipi üretir. */
export function mimeFromFormat(f: keyof FormatEnum | 'webp'): string {
  switch (f) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'avif':
      return 'image/avif';
    case 'tiff':
      return 'image/tiff';
    case 'heif':
      return 'image/heif';
    default:
      return 'application/octet-stream';
  }
}

/**
 * MIME → izin verilen uzantılar eşlemesi (CSV/Excel import için kontrol).
 */
export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
export const ALLOWED_VIDEO_MIMES = new Set(['video/mp4']);
export const ALLOWED_DOCUMENT_MIMES = new Set(['application/pdf']);

/** İçeriğin izin verilen kategorilerden birine uyup uymadığını söyler. */
export function classifyMime(mime: string): 'image' | 'video' | 'document' | 'other' {
  if (ALLOWED_IMAGE_MIMES.has(mime)) return 'image';
  if (ALLOWED_VIDEO_MIMES.has(mime)) return 'video';
  if (ALLOWED_DOCUMENT_MIMES.has(mime)) return 'document';
  return 'other';
}
