/**
 * Ödeme başarısız sayfası — Server Component.
 *
 * `searchParams.code` ve `searchParams.message` ile hata detayları
 * gösterilir. "Tekrar Dene" ödeme sayfasına döner.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Heading, Card, Button } from '@eticart/ui';

export const metadata: Metadata = {
  title: 'Ödeme Başarısız',
  description: 'Ödeme işlemi tamamlanamadı. Lütfen tekrar deneyin.',
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly searchParams: Promise<{ code?: string; message?: string }>;
}

export default async function CheckoutFailedPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const params = await searchParams;
  const errorCode = params.code ?? 'UNKNOWN_ERROR';
  const errorMessage = params.message ?? 'Ödeme işlemi tamamlanamadı. Lütfen tekrar deneyin.';

  return (
    <div
      className="theme-container"
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '48px 16px',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }} aria-live="assertive">
        <div aria-hidden="true" style={{ fontSize: 64 }}>
          ⚠️
        </div>
        <Heading level={1} style={{ fontSize: 28, margin: '12px 0 4px' }}>
          Ödeme Tamamlanamadı
        </Heading>
        <p style={{ color: 'var(--theme-muted, #6b7280)' }}>
          İşleminiz sırasında bir sorun oluştu. Sepetiniz korunmuştur.
        </p>
      </div>

      <Card>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Hata Detayı</h2>
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
          <div>
            <dt style={{ marginBottom: 4, color: 'var(--theme-muted, #6b7280)', fontSize: 12 }}>
              Hata Kodu
            </dt>
            <dd
              style={{
                margin: 0,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontWeight: 600,
                color: '#dc2626',
              }}
            >
              {errorCode}
            </dd>
          </div>
          <div>
            <dt style={{ marginBottom: 4, color: 'var(--theme-muted, #6b7280)', fontSize: 12 }}>
              Hata Mesajı
            </dt>
            <dd style={{ margin: 0 }}>{errorMessage}</dd>
          </div>
        </dl>
      </Card>

      <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/odeme" passHref legacyBehavior>
          <a>
            <Button variant="primary" size="lg">
              Tekrar Dene
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
          marginTop: 24,
          fontSize: 13,
          textAlign: 'center',
          color: 'var(--theme-muted, #6b7280)',
        }}
      >
        Sorun devam ederse bizimle iletişime geçin:{' '}
        <a
          href="mailto:destek@eticart.example.com"
          style={{ color: 'var(--theme-primary, #111827)', fontWeight: 600 }}
        >
          destek@eticart.example.com
        </a>
      </p>
    </div>
  );
}
