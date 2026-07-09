/**
 * Standart API yanıt modeli.
 *
 * Tüm endpoint'lerin başarılı yanıtı:
 *   { success: true, data: T }
 *
 * Tüm endpoint'lerin hata yanıtı:
 *   { success: false, error: { code, message, details? } }
 *
 * @module response
 */

import { ApiError, type ErrorDetails } from '../errors/index.js';

/**
 * Başarılı yanıt zarfı.
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/**
 * Hata yanıtı zarfı.
 */
export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ErrorDetails;
  };
}

/**
 * Herhangi bir standart API yanıtı.
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * Başarılı yanıt üret.
 */
export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

/**
 * Hata yanıtı üret. Kodlanmış hatalar için `ApiError` kullanın.
 */
export function fail(
  code: string,
  message: string,
  details?: ErrorDetails,
): ApiFailure {
  return { success: false, error: { code, message, details } };
}

/**
 * `ApiError`'ı standart API hata yanıtına çevir.
 */
export function fromApiError(error: ApiError): ApiFailure {
  return fail(error.code, error.message, error.details);
}
