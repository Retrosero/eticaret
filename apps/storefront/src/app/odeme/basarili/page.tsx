/**
 * Sipariş başarı sayfası — Server Component.
 *
 * `searchParams.orderNumber` ile sipariş numarasını alır. Tahmini teslimat
 * tarihini hesaplar, kısa özet + takip linki gösterir.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Heading, Card, Button } from '@eticart/ui';
import { formatDateTr } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Siparişiniz Alındı',
  description: 'Siparişiniz başarıyla oluşturuldu.',
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly searchParams: Promise<{ orderNumber?: string; estimatedDelivery?: string }>;
}

export default async function CheckoutSuccessPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const params = await searchParams;
  const orderNumber = params.orderNumber ?? '—';

  // Tahmini teslimat tarihi (bugün + 3 gün) veya URL'den explicit
  const estimatedDelivery = (() => {
    if (params.estimatedDelivery !== undefined && params.estimatedDelivery.length > 0) {
      return new Date(params.estimatedDelivery);
    }
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d;
  })();

  return (
    <div
      className="theme-container"
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '48px 16px',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }} aria-live="polite">
        <div aria-hidden="true" style={{ fontSize: 64 }}>
          ✅
        </div>
        <Heading level={1} style={{ fontSize: 28, margin: '12px 0 4px' }}>
          Siparişiniz Alındı!
        </Heading>
        <p style={{ color: 'var(--theme-muted, #6b7280)' }}>
          Siparişiniz başarıyla oluşturuldu. Onay e-postası kısa süre içinde tarafınıza ulaşacaktır.
        </p>
      </div>

      <Card>
        <dl style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <dt style={{ margin: 0, color: 'var(--theme-muted, #6b7280)' }}>Sipariş Numarası</dt>
            <dd
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: 18,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {orderNumber}
            </dd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <dt style={{ margin: 0, color: 'var(--theme-muted, #6b7280)' }}>Tahmini Teslimat</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{formatDateTr(estimatedDelivery)}</dd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <dt style={{ margin: 0, color: 'var(--theme-muted, #6b7280)' }}>Ödeme Durumu</dt>
            <dd style={{ margin: 0, fontWeight: 600, color: '#16a34a' }}>Onaylandı</dd>
          </div>
        </dl>
      </Card>

      <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link
          href={`/siparis-takip/${encodeURIComponent(orderNumber)}`}
          passHref
          legacyBehavior
        >
          <a>
            <Button variant="primary" size="lg">
              Siparişimi Takip Et
            </Button>
          </a>
        </Link>
        <Link href="/" passHref legacyBehavior>
          <a>
            <Button variant="secondary" size="lg">
              Alışverişe Devam
            </Button>
          </a>
        </Link>
      </div>

      <p
        style={{
          marginTop: 32,
          padding: 16,
          background: 'var(--theme-bg, #f9fafb)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--theme-muted, #6b7280)',
        }}
        role="note"
        aria-label="KVKK bilgilendirme"
      >
        Siparişinize ve kişisel verilerinize ilişkin KVKK kapsamındaki haklarınız için lütfen
        <Link href="/kvkk" style={{ marginLeft: 4, color: 'var(--theme-primary, #111827)' }}>
          aydınlatma metnini
        </Link>{' '}
        inceleyin.
      </p>
    </div>
  );
}
