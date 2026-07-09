/**
 * iyzico 3D Secure yönlendirme bileşeni.
 *
 * Backend `redirectUrl` döndüğünde tetiklenir; mount olur olmaz
 * `window.location.replace` ile banka 3D form sayfasına yönlendirir.
 * Yönlendirme gerçekleşene kadar spinner + bilgilendirme gösterir.
 */

'use client';

import { useEffect } from 'react';

interface Props {
  readonly url: string;
}

export function IyzicoRedirect({ url }: Props): JSX.Element {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.location.replace(url);
    } catch {
      // no-op — fallback render görünür
    }
  }, [url]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '48px 20px',
        textAlign: 'center',
        border: '1px solid var(--theme-border, #e5e7eb)',
        borderRadius: 12,
        background: 'var(--theme-surface, #fff)',
      }}
    >
      <div aria-hidden="true" style={{ fontSize: 48, marginBottom: 16 }}>
        🔒
      </div>
      <h1 style={{ margin: 0, fontSize: 22 }}>Güvenli ödeme sayfasına yönlendiriliyorsunuz…</h1>
      <p style={{ marginTop: 8, color: 'var(--theme-muted, #6b7280)' }}>
        iyzico 3D Secure doğrulaması için bankanızın sayfasına geçiş yapılıyor. Lütfen bekleyin.
      </p>
      <noscript>
        <p style={{ marginTop: 16 }}>
          Yönlendirme gerçekleşmediyse{' '}
          <a href={url} style={{ color: 'var(--theme-primary, #111827)' }}>
            buraya tıklayın
          </a>
          .
        </p>
      </noscript>
    </div>
  );
}
