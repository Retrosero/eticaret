'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const CONTROL_PLANE = process.env['NEXT_PUBLIC_CONTROL_PLANE_API'] ?? 'http://localhost:3002';

function LoginScreenInner() {
  const router = useRouter();
  const params = useSearchParams();
  const errorParam = params.get('error');
  const [error, setError] = useState<string | null>(
    errorParam === 'forbidden'
      ? 'Bu email için super admin erişimi yok.'
      : errorParam === 'unconfigured'
      ? 'OAuth yapılandırılmamış.'
      : null,
  );

  function loginWith(provider: 'google' | 'microsoft') {
    setError(null);
    const redirectUri = `${window.location.origin}/login/callback`;
    fetch(`${CONTROL_PLANE}/sso/${provider}/login?redirect_uri=${encodeURIComponent(redirectUri)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError('OAuth URL alınamadı.');
        }
      })
      .catch(() => setError('Backend\'e ulaşılamadı.'));
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        padding: '2rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '3rem 2.5rem',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.75rem', color: '#0f172a' }}>
          EtiCart Super Admin
        </h1>
        <p style={{ margin: '0.5rem 0 2rem', color: '#6b7280', fontSize: '0.875rem' }}>
          SSO ile giriş yapın
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => loginWith('google')}
            style={{
              padding: '0.75rem 1rem',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: '0.9375rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>🇬</span>
            Google ile devam et
          </button>

          <button
            type="button"
            onClick={() => loginWith('microsoft')}
            style={{
              padding: '0.75rem 1rem',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: '0.9375rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>🇲</span>
            Microsoft ile devam et
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: '1.5rem',
              padding: '0.625rem 0.875rem',
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: 6,
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        <p style={{ marginTop: '2rem', color: '#9ca3af', fontSize: '0.75rem' }}>
          Sadece allowlist'teki email'ler erişebilir.
          <br />
          Sorun yaşarsanız{' '}
          <a href="mailto:support@eticart.com.tr" style={{ color: '#3b82f6' }}>
            support@eticart.com.tr
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Yükleniyor...</div>}>
      <LoginScreenInner />
    </Suspense>
  );
}