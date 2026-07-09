/**
 * Tüm modüllerde kullanılan ortak temel tipler.
 *
 * Buradaki tipler tüm dış servislerin sözleşmesini temsil eder.
 * Bu modül runtime içermez; yalnızca tip düzeyinde taşınır.
 */

import type { ErrorCodeValue } from '@eticart/config';

/** ISO 8601 tarih-saat dizgisi. */
export type IsoDateString = string;

/** UUID v4 kimliği. */
export type Uuid = string;

/** Para birimi kodu (ISO 4217). */
export type CurrencyCode = 'TRY' | 'USD' | 'EUR' | 'GBP';

/** Sayfa boyutu. */
export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
}

/** Sayfalanmış veri. */
export interface Paginated<T> {
  items: ReadonlyArray<T>;
  pageInfo: PageInfo;
}

/** Hata sözleşmesi — istemci tipi. */
export interface ClientError {
  code: ErrorCodeValue | string;
  message: string;
  details?: Record<string, unknown>;
}

/** Başarılı API yanıtı. */
export interface ClientSuccess<T> {
  success: true;
  data: T;
}

/** Hata API yanıtı. */
export interface ClientFailure {
  success: false;
  error: ClientError;
}

/** Standart API yanıtı. */
export type ClientResponse<T> = ClientSuccess<T> | ClientFailure;

/** Sağlık kontrolü yanıtı. */
export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  timestamp: IsoDateString;
  uptimeSeconds: number;
}

/** Hazırlık kontrolü yanıtı. */
export interface ReadinessResponse extends HealthCheckResponse {
  checks: Readonly<Record<string, 'ok' | 'down' | 'skipped'>>;
}
