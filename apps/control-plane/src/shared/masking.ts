/**
 * KVKK maskeleme yardımcıları — loglama ve audit için.
 *
 * Bu fonksiyonlar `@eticart/observability/kvkk` paketinin
 * basit sarmalayıcılarıdır. DB veya HTTP üzerinden dolaşan
 * kişisel veriler bu katmandan geçirilir.
 */

import {
  maskEmail,
  maskPhone,
  maskTckn,
  maskAddress,
  maskKvkkFields,
} from '@eticart/observability/kvkk';

/** E-posta maskele. */
export const maskMail = maskEmail;

/** Telefon maskele. */
export const maskTel = maskPhone;

/** TCKN maskele. */
export const maskNationalId = maskTckn;

/** Adres maskele. */
export const maskAddr = maskAddress;

/** Objedeki tüm KVKK alanlarını maskele. */
export const maskKvkk = maskKvkkFields;

/** IP adresini maskele (son okteti gizle). */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (ip === '::1' || ip === '127.0.0.1') return '127.0.0.0';
  // IPv4
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4 && v4[1]) return `${v4[1]}.0`;
  // IPv6 — son 4 heksı gizle
  if (ip.includes(':')) {
    const idx = ip.lastIndexOf(':');
    return idx > 0 ? `${ip.slice(0, idx)}:****` : '****';
  }
  return '***';
}

/** Vergi kimlik numarası maskele. */
export function maskTaxId(value: string | null | undefined): string {
  if (!value) return '';
  const cleaned = value.replace(/\s+/g, '');
  if (cleaned.length < 4) return '***';
  return `***${cleaned.slice(-4)}`;
}