/**
 * Ortak UI yardımcıları — className birleştirme.
 */
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Türkçe para formatı (TRY). */
export function formatCurrency(value: number | string, currency = 'TRY'): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
  }).format(num);
}

/** Türkçe tarih formatı. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Türkçe tarih (sadece gün.ay.yıl). */
export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/** Sipariş durumu Türkçe etiketleri. */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Beklemede',
  pending_payment: 'Ödeme Bekleniyor',
  awaiting_payment: 'Ödeme Onayı Bekleniyor',
  paid: 'Ödendi',
  confirmed: 'Onaylandı',
  preparing: 'Hazırlanıyor',
  partially_shipped: 'Kısmen Kargolandı',
  shipped: 'Kargoda',
  delivered: 'Teslim Edildi',
  returned: 'İade Edildi',
  refunded: 'İade Ödendi',
  cancelled: 'İptal Edildi',
  failed: 'Başarısız',
  closed: 'Kapandı',
  on_hold: 'Beklemede',
};

/** Ödeme durumu Türkçe etiketleri. */
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Beklemede',
  authorized: 'Onaylandı',
  captured: 'Tahsil Edildi',
  failed: 'Başarısız',
  expired: 'Süresi Doldu',
  refunded: 'İade Edildi',
  partially_refunded: 'Kısmen İade',
};

/** Durum badge rengini döner. */
export function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (['cancelled', 'failed', 'expired'].includes(status)) return 'destructive';
  if (['paid', 'delivered', 'confirmed', 'shipped'].includes(status)) return 'default';
  if (['refunded', 'returned'].includes(status)) return 'secondary';
  return 'outline';
}