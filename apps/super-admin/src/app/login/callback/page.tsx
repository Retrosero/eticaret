'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const CONTROL_PLANE = process.env['NEXT_PUBLIC_CONTROL_PLANE_API'] ?? 'http://localhost:3002';

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code = params.get('code');
    const provider = (params.get('provider') as 'google' | 'microsoft' | null) ?? 'google';
    if (!code) {
      router.replace('/login?error=missing_code');
      return;
    }

    const redirectUri = `${window.location.origin}/login/callback`;
    fetch(
      `${CONTROL_PLANE}/sso/${provider}/callback?code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`,
      { credentials: 'include' },
    )
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          if (err.statusCode === 403) {
            router.replace('/login?error=forbidden');
          } else {
            router.replace('/login?error=unconfigured');
          }
          return;
        }
        router.replace('/dashboard');
      })
      .catch(() => {
        router.replace('/login?error=network');
      });
  }, [params, router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#fff',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 1rem',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p>Giriş doğrulanıyor...</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div>Yükleniyor...</div>}>
      <CallbackInner />
    </Suspense>
  );
}