/**
 * Sepet kalem listesi — Client Component.
 *
 * Cart store'dan beslenir; her satır için miktar stepper + sil butonu
 * gösterir. Boş durumda `<EmptyCart />` fallback'i tetikler.
 */

'use client';

import { useEffect } from 'react';
import { useCartStore, hydrateCartStore } from '@/lib/cart-store.js';
import { CartItemRow } from './cart-item-row.js';
import { EmptyCart } from './empty-cart.js';

export function CartList(): JSX.Element {
  // İlk mount'ta store'u hidre et (SSR-skipHydration)
  useEffect(() => {
    hydrateCartStore();
  }, []);

  const items = useCartStore((s) => s.items);
  const isLoading = useCartStore((s) => s.isLoading);

  if (items.length === 0 && !isLoading) {
    return <EmptyCart />;
  }

  return (
    <div role="region" aria-label="Sepetteki ürünler">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item) => (
          <li key={item.id}>
            <CartItemRow item={item} />
          </li>
        ))}
      </ul>
      {isLoading ? (
        <p
          role="status"
          aria-live="polite"
          style={{ marginTop: 12, fontSize: 13, color: 'var(--theme-muted, #6b7280)' }}
        >
          Sepet güncelleniyor…
        </p>
      ) : null}
    </div>
  );
}
