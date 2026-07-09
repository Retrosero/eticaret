/**
 * Türk Lirası para değeri görüntüleyen sunucu bileşeni.
 *
 * SSR uyumlu: locale her zaman "tr-TR". `amount` kuruş cinsinden.
 */

import { type FC } from 'react';

export interface TrCurrencyProps {
  /** Para miktarı, kuruş cinsinden. */
  amount: number;
  /** Para birimi kodu; TRY dışındaki değerler gösterilir ama sıralı değildir. */
  currency?: 'TRY' | 'USD' | 'EUR' | 'GBP';
  /** Ondalık basamak sayısı. */
  decimals?: number;
  className?: string;
}

const FORMATTERS_CACHE = new Map<string, Intl.NumberFormat>();

function getFormatter(
  currency: 'TRY' | 'USD' | 'EUR' | 'GBP',
  decimals: number,
): Intl.NumberFormat {
  const key = `${currency}:${decimals}`;
  const cached = FORMATTERS_CACHE.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  FORMATTERS_CACHE.set(key, formatter);
  return formatter;
}

export const TrCurrency: FC<TrCurrencyProps> = ({
  amount,
  currency = 'TRY',
  decimals = 2,
  className,
}) => {
  const major = amount / Math.pow(10, decimals);
  const formatted = getFormatter(currency, decimals).format(major);
  return (
    <span className={className} aria-label={`${major} ${currency}`}>
      {formatted}
    </span>
  );
};
