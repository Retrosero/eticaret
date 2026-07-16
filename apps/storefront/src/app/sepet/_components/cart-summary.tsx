/**
 * Sepet özet paneli — Client Component.
 *
 * Ara toplam, kargo, indirim, genel toplam ve "Ödemeye Geç" butonu.
 */

'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@eticart/ui';
import { useCartStore } from '@/lib/cart-store';
import { formatPriceKurus } from '@/lib/format';

export function CartSummary(): JSX.Element {
  const router = useRouter();
  const itemCount = useCartStore((s) => s.itemCount);
  const subtotal = useCartStore((s) => s.subtotalKurus);
  const shipping = useCartStore((s) => s.shippingKurus);
  const discount = useCartStore((s) => s.discountKurus);
  const grandTotal = useCartStore((s) => s.grandTotalKurus);
  const currency = useCartStore((s) => s.currency);
  const isLoading = useCartStore((s) => s.isLoading);
  const isDemo = useCartStore((s) => s.isDemo);

  const isEmpty = itemCount === 0;

  const handleCheckout = (): void => {
    router.push('/odeme');
  };

  return (
    <aside
      aria-label="Sipariş özeti"
      style={{
        border: '1px solid var(--theme-border, #e5e7eb)',
        borderRadius: 12,
        background: 'var(--theme-surface, #fff)',
        padding: 20,
        position: 'sticky',
        top: 16,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Sipariş Özeti</h2>

      {isDemo ? (
        <p
          role="note"
          aria-label="Demo mod bilgilendirmesi"
          style={{
            marginTop: 12,
            padding: '8px 12px',
            background: '#fef3c7',
            color: '#92400e',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          Demo mod: backend bağlantısı bekleniyor, sepet localStorage'da saklanıyor.
        </p>
      ) : null}

      <dl
        style={{
          marginTop: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          fontSize: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <dt>Ürün Adedi</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{itemCount}</dd>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <dt>Ara Toplam</dt>
          <dd style={{ margin: 0 }}>{formatPriceKurus(subtotal, currency)}</dd>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <dt>Kargo</dt>
          <dd style={{ margin: 0 }}>
            {shipping === 0 ? <em style={{ color: '#16a34a' }}>Ücretsiz</em> : formatPriceKurus(shipping, currency)}
          </dd>
        </div>
        {discount > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
            <dt>İndirim</dt>
            <dd style={{ margin: 0 }}>−{formatPriceKurus(discount, currency)}</dd>
          </div>
        ) : null}
      </dl>

      <hr
        style={{
          border: 0,
          borderTop: '1px solid var(--theme-border, #e5e7eb)',
          margin: '16px 0',
        }}
      />

      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
        aria-label="Genel toplam"
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>Genel Toplam</span>
        <strong style={{ fontSize: 22 }}>{formatPriceKurus(grandTotal, currency)}</strong>
      </div>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={handleCheckout}
        disabled={isEmpty}
        loading={isLoading}
        aria-label="Ödemeye geç"
        style={{ marginTop: 20 }}
      >
        Ödemeye Geç
      </Button>

      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--theme-muted, #6b7280)', textAlign: 'center' }}>
        Sepetiniz 7 gün boyunca saklanır (KVKK).
      </p>
    </aside>
  );
}
