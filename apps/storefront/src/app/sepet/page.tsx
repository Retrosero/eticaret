/**
 * Sepet sayfası — Server Component (root).
 *
 * İki kolon düzeninde `<CartList />` ve `<CartSummary />` çağırır.
 * Sepetin gerçek içeriği istemci tarafında `cart-store` tarafından
 * yönetilir (localStorage persist). Server tarafında sadece iskelet sağlanır.
 */

import type { Metadata } from 'next';
import { Heading } from '@eticart/ui';
import { CartList } from './_components/cart-list';
import { CartSummary } from './_components/cart-summary';

export const metadata: Metadata = {
  title: 'Sepetim',
  description: 'Sepetinizi görüntüleyin ve ödemeye geçin',
  robots: { index: false, follow: false },
};

export default function CartPage(): JSX.Element {
  return (
    <div
      className="theme-container"
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '32px 16px',
      }}
    >
      <Heading level={1} style={{ fontSize: 28, marginBottom: 24 }}>
        Sepetim
      </Heading>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 360px',
          gap: 24,
          alignItems: 'flex-start',
        }}
        className="sepet-layout"
      >
        <section aria-label="Sepet içeriği">
          <CartList />
          {/* KVKK bandı */}
          <p
            style={{
              marginTop: 24,
              fontSize: 12,
              color: 'var(--theme-muted, #6b7280)',
              textAlign: 'center',
            }}
            role="note"
            aria-label="KVKK bilgilendirme"
          >
            Sepetiniz 7 gün boyunca saklanır. KVKK kapsamında verileriniz
            yalnızca sipariş sürecinde kullanılır.
          </p>
        </section>
        <CartSummary />
      </div>

      {/* Mobil için responsive grid: tek kolona düş */}
      <style>{`
        @media (max-width: 900px) {
          .sepet-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
