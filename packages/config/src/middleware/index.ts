/**
 * Ortak middleware yardımcıları.
 *
 * `requestId`, `correlationId` ve yapısal loglama
 * her HTTP katmanında uygulanmalıdır.
 *
 * @module middleware
 */

import type { IncomingHttpHeaders, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

/**
 * Gelen istekten `x-request-id` veya `x-correlation-id` başlığını okur.
 * Bulunmazsa yeni bir UUID üretir. Asla boş dönmeyi garanti eder.
 */
export function pickOrCreateRequestId(
  headers: IncomingHttpHeaders,
): { requestId: string; correlationId: string } {
  const fromHeader = (key: string): string | undefined => {
    const raw = headers[key];
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
      return raw[0];
    }
    return undefined;
  };

  const incomingRequestId =
    fromHeader('x-request-id') ?? fromHeader('x-correlation-id');

  const incomingCorrelationId =
    fromHeader('x-correlation-id') ?? fromHeader('x-request-id');

  const requestId = sanitizeId(incomingRequestId) ?? randomUUID();
  const correlationId = sanitizeId(incomingCorrelationId) ?? randomUUID();

  return { requestId, correlationId };
}

/**
 * ID değerini güvenli kabul etmek için basit sanitizasyon:
 *  - sadece alfa-sayısal, tire ve alt çizgi
 *  - en fazla 128 karakter
 * Geçersizse `undefined` döner (üretici yeni UUID atar).
 */
export function sanitizeId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return undefined;
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Yanıt başlığına `X-Request-Id` ve `X-Correlation-Id` ekler.
 */
export function writeCorrelationHeaders(
  res: ServerResponse,
  ids: { requestId: string; correlationId: string },
): void {
  res.setHeader('X-Request-Id', ids.requestId);
  res.setHeader('X-Correlation-Id', ids.correlationId);
}

/** Varsayılan istek gövdesi boyut sınırı. */
export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024; // 1 MB

/**
 * `content-length` başlığından gelen boyutu sınıra karşı kontrol eder.
 * Sınırı aşan istekler için `ApiError` hazırlığı için bilgi döner.
 */
export function checkBodyLimit(
  headers: IncomingHttpHeaders,
  limitBytes: number = DEFAULT_BODY_LIMIT_BYTES,
): { ok: true } | { ok: false; limit: number } {
  const raw = headers['content-length'];
  const lengthStr = Array.isArray(raw) ? raw[0] : raw;
  if (!lengthStr) return { ok: true };
  const length = Number.parseInt(lengthStr, 10);
  if (Number.isNaN(length)) return { ok: true };
  if (length > limitBytes) return { ok: false, limit: limitBytes };
  return { ok: true };
}
