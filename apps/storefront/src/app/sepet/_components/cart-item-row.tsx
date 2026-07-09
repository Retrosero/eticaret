/**
 * Tek bir sepet kalemi satırı — Client Component.
 *
 * Miktar stepper, birim fiyat, satır toplam ve sil butonu içerir.
 */

'use client';

import type { CartItem } from '@/lib/cart-store.js';
import { useCartStore } from '@/lib/cart-store.js';
import { TrCurrency, Button } from '@eticart/ui';
import { formatPriceKurus } from '@/lib/format.js';

interface Props {
  readonly item: CartItem;
}

export function CartItemRow({ item }: Props): JSX.Element {
  const updateItem = useCartStore((s) => s.updateItem);
  const removeItem = useCartStore((s) => s.removeItem);

  const handleDecrement = (): void => {
    void updateItem(item.id, item.quantity - 1);
  };

  const handleIncrement = (): void => {
    void updateItem(item.id, item.quantity + 1);
  };

  const handleRemove = (): void => {
    void removeItem(item.id);
  };

  return (
    <article
      style={{
        display: 'grid',
        gridTemplateColumns: '88px 1fr auto',
        gap: 16,
        padding: 16,
        border: '1px solid var(--theme-border, #e5e7eb)',
        borderRadius: 12,
        background: 'var(--theme-surface, #fff)',
        alignItems: 'flex-start',
      }}
      aria-label={`Sepet kalemi: ${item.name}`}
    >
      {/* Görsel */}
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 8,
          background: 'var(--theme-bg, #f3f4f6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span aria-hidden="true" style={{ fontSize: 24, color: 'var(--theme-muted, #9ca3af)' }}>
            🛍️
          </span>
        )}
      </div>

      {/* İçerik */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{item.name}</h3>
        {item.variantLabel ? (
          <span style={{ fontSize: 12, color: 'var(--theme-muted, #6b7280)' }}>
            {item.variantLabel}
          </span>
        ) : null}
        {item.sku ? (
          <span style={{ fontSize: 12, color: 'var(--theme-muted, #6b7280)' }}>SKU: {item.sku}</span>
        ) : null}
        <div style={{ fontSize: 13, color: 'var(--theme-text, #374151)' }}>
          Birim fiyat: <strong>{formatPriceKurus(item.unitPriceKurus)}</strong>
        </div>

        {/* Miktar stepper */}
        <div
          role="group"
          aria-label={`${item.name} miktar kontrol`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
            border: '1px solid var(--theme-border, #d1d5db)',
            borderRadius: 6,
            padding: 2,
            width: 'fit-content',
          }}
        >
          <button
            type="button"
            onClick={handleDecrement}
            aria-label="Azalt"
            disabled={item.quantity <= 1}
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              cursor: item.quantity <= 1 ? 'not-allowed' : 'pointer',
              fontSize: 16,
              opacity: item.quantity <= 1 ? 0.4 : 1,
            }}
          >
            −
          </button>
          <span
            aria-live="polite"
            aria-atomic="true"
            style={{
              minWidth: 28,
              textAlign: 'center',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={handleIncrement}
            aria-label="Arttır"
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Sağ kolon: toplam + sil */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
        <TrCurrency
          amount={item.lineTotalKurus}
          decimals={2}
          style={{ fontWeight: 700, fontSize: 16 }}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          aria-label={`${item.name} sepetten sil`}
          style={{ color: '#dc2626' }}
        >
          Sil
        </Button>
      </div>
    </article>
  );
}
