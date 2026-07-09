/**
 * @eticart/config — smoke testleri
 *
 * Amaç: paketin en azından yüklenebildiğini ve temel üreticilerin
 * doğru tipte değerler döndürdüğünü kanıtlamak.
 */

import { describe, it, expect } from 'vitest';

import { ApiError, ErrorCode } from './errors/index.js';
import { ok, fail, fromApiError } from './response/index.js';
import { createLogger } from './logger/index.js';
import {
  pickOrCreateRequestId,
  sanitizeId,
  checkBodyLimit,
  parseCorsOrigins,
  isOriginAllowed,
} from './middleware/index.js';

describe('@eticart/config', () => {
  describe('ApiError', () => {
    it('standart hata nesnesi üretir', () => {
      const err = new ApiError(404, ErrorCode.NOT_FOUND, 'Ürün bulunamadı');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('Ürün bulunamadı');
      expect(err.name).toBe('ApiError');
    });

    it('toJSON üretimde stack içermez', () => {
      const err = new ApiError(500, ErrorCode.INTERNAL_SERVER_ERROR, 'Hata');
      const json = err.toJSON(false);
      expect(json.stack).toBeUndefined();
      expect(json.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('toJSON geliştirmede stack içerir', () => {
      const err = new ApiError(500, ErrorCode.INTERNAL_SERVER_ERROR, 'Hata');
      const json = err.toJSON(true);
      expect(typeof json.stack).toBe('string');
    });
  });

  describe('ApiResponse', () => {
    it('ok başarılı zarfı döner', () => {
      const out = ok({ a: 1 });
      expect(out.success).toBe(true);
      if (out.success) expect(out.data).toEqual({ a: 1 });
    });

    it('fail hata zarfı döner', () => {
      const out = fail('BAD', 'mesaj', { x: 1 });
      expect(out.success).toBe(false);
      if (!out.success) {
        expect(out.error.code).toBe('BAD');
        expect(out.error.details).toEqual({ x: 1 });
      }
    });

    it('fromApiError ApiError -> ApiFailure dönüşümü yapar', () => {
      const err = new ApiError(409, ErrorCode.CONFLICT, 'çakışma');
      const out = fromApiError(err);
      expect(out.success).toBe(false);
      if (!out.success) {
        expect(out.error.code).toBe('CONFLICT');
        expect(out.error.message).toBe('çakışma');
      }
    });
  });

  describe('logger', () => {
    it('createLogger pino logger döner', () => {
      const logger = createLogger({
        service: 'control-plane',
        version: '0.1.0',
      });
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.child).toBe('function');
    });
  });

  describe('middleware', () => {
    it('pickOrCreateRequestId başlık yoksa UUID üretir', () => {
      const { requestId, correlationId } = pickOrCreateRequestId({});
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('pickOrCreateRequestId geçerli başlığı korur', () => {
      const { requestId } = pickOrCreateRequestId({
        'x-request-id': 'req_123',
      });
      expect(requestId).toBe('req_123');
    });

    it('pickOrCreateRequestId geçersiz başlığı reddeder', () => {
      const { requestId } = pickOrCreateRequestId({
        'x-request-id': 'bad value with spaces',
      });
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('sanitizeId güvenli karakter setinden geçirir', () => {
      expect(sanitizeId('abc_123')).toBe('abc_123');
      expect(sanitizeId('bad space')).toBeUndefined();
      expect(sanitizeId('')).toBeUndefined();
      expect(sanitizeId('a'.repeat(200))).toBeUndefined();
    });

    it('checkBodyLimit sınırın altındaki boyutlarda geçer', () => {
      expect(checkBodyLimit({ 'content-length': '1024' })).toEqual({ ok: true });
    });

    it('checkBodyLimit sınırı aşanları reddeder', () => {
      const result = checkBodyLimit({
        'content-length': String(2 * 1024 * 1024),
      });
      expect(result.ok).toBe(false);
    });

    it('parseCorsOrigins yıldızı reddeder', () => {
      const set = parseCorsOrigins('https://a.example, * , https://b.example');
      expect(set.has('https://a.example')).toBe(true);
      expect(set.has('https://b.example')).toBe(true);
      expect(set.has('*')).toBe(false);
    });

    it('isOriginAllowed case-insensitive karşılaştırır', () => {
      const set = parseCorsOrigins('https://app.example');
      expect(isOriginAllowed('https://app.example', set)).toBe(true);
      expect(isOriginAllowed('https://APP.EXAMPLE', set)).toBe(true);
      expect(isOriginAllowed('https://evil.example', set)).toBe(false);
    });
  });
});
