/**
 * Ödeme sayfası — Server Component (root).
 *
 * `<CheckoutForm />` istemci bileşenini çağırır. Form'un kendisi adres
 * ve ödeme yönetimi içerir.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Heading } from '@eticart/ui';
import { CheckoutForm } from './_components/checkout-form.js';

export const metadata: Metadata = {
  title: 'Ödeme',
  description: 'Siparişinizi tamamlayın. Güvenli ödeme.',
  robots: { index: false, follow: false },
};

export default function CheckoutPage(): JSX.Element {
  return (
    <div
      className="theme-container"
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '32px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Heading level={1} style={{ fontSize: 28, margin: 0 }}>
          Ödeme
        </Heading>
        <nav aria-label="breadcrumb" style={{ fontSize: 13, color: 'var(--theme-muted, #6b7280)' }}>
          <Link href="/sepet">← Sepete Dön</Link>
        </nav>
      </div>

      <CheckoutForm />
    </div>
  );
}
