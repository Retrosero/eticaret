/**
 * Merkezi hata modeli.
 *
 * Tüm uygulamalar tek bir hata sınıfı kullanır; HTTP'ye yansıtılırken
 * standart JSON formatına dönüştürülür. Stack trace yalnızca
 * geliştirme ortamında yanıta dahil edilir.
 *
 * @module errors
 */

/**
 * Hata kodları — her biri istemciye iletilecek kararlı bir tanımlayıcıdır.
 * Yeni kodlar buraya eklenmeli ve tüm istemcilere (store/admin/super)
 * `@eticart/shared-types` üzerinden yayılmalıdır.
 */
export const ErrorCode = {
  // 400
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  // 401
  UNAUTHORIZED: 'UNAUTHORIZED',
  // 403
  FORBIDDEN: 'FORBIDDEN',
  TENANT_FORBIDDEN: 'TENANT_FORBIDDEN',
  // 404
  NOT_FOUND: 'NOT_FOUND',
  // 409
  CONFLICT: 'CONFLICT',
  // 429
  RATE_LIMITED: 'RATE_LIMITED',
  // 500
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  // 502 / 503 / 504
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  // Multi-tenant
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  // KVKK
  KVKK_CONSENT_REQUIRED: 'KVKK_CONSENT_REQUIRED',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Hata yanıtındaki `details` alanı için serbest tiptir.
 * Genellikle Zod'un `ZodError.flatten()` çıktısı kullanılır.
 */
export type ErrorDetails = Record<string, unknown> | undefined;

/**
 * Uygulama genelinde standart API hatası.
 *
 * @example
 * ```ts
 * throw new ApiError(404, ErrorCode.NOT_FOUND, 'Ürün bulunamadı');
 * ```
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeValue | string;
  public readonly details?: ErrorDetails;
  public override readonly cause?: unknown;

  constructor(
    statusCode: number,
    code: ErrorCodeValue | string,
    message: string,
    options?: { details?: ErrorDetails; cause?: unknown },
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options?.details;
    this.cause = options?.cause;

    // Prototip zincirinin doğru aktarılması (TypeScript ES2022'de otomatik)
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * API'ye gönderilecek standart JSON gövdesini üretir.
   * Geliştirme dışı ortamda `stack` alanı gizlenir.
   */
  toJSON(isDevelopment: boolean): {
    code: ErrorCodeValue | string;
    message: string;
    details?: ErrorDetails;
    stack?: string;
  } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      ...(isDevelopment && this.stack ? { stack: this.stack } : {}),
    };
  }
}
