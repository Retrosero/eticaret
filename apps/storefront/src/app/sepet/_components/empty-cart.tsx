/**
 * Boş sepet durumu — Server Component.
 *
 * Sepette hiç ürün yoksa gösterilir. Alışverişe başla linki sunar.
 */

import Link from 'next/link';
import { Button } from '@eticart/ui';

export function EmptyCart(): JSX.Element {
  return (
    <div
      role="status"
      style={{
        padding: '48px 20px',
        textAlign: 'center',
        border: '1px dashed var(--theme-border, #d1d5db)',
        borderRadius: 12,
        background: 'var(--theme-bg, #f9fafb)',
      }}
    >
      <div aria-hidden="true" style={{ fontSize: 48, marginBottom: 12 }}>
        🛒
      </div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Sepetiniz şu an boş</h2>
      <p style={{ marginTop: 8, color: 'var(--theme-muted, #6b7280)' }}>
        Beğendiğiniz ürünleri sepete ekleyerek alışverişe başlayabilirsiniz.
      </p>
      <div style={{ marginTop: 20 }}>
        <Link href="/" passHref legacyBehavior>
          <a
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: 'var(--theme-primary, #111827)',
              color: '#fff',
              borderRadius: 6,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Alışverişe Başla
          </a>
        </Link>
      </div>
      <p
        style={{
          marginTop: 16,
          fontSize: 12,
          color: 'var(--theme-muted, #6b7280)',
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Sipariş takip"
          onClick={() => {
            window.location.href = '/siparis-takip';
          }}
        >
          Siparişimi mi arıyorsun?
        </Button>
      </p>
    </div>
  );
}
