'use client';

import { useState, useTransition } from 'react';

export function SuspendButton({ tenantId }: { tenantId: string }) {
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  async function handleSuspend() {
    if (!reason.trim()) {
      setError('Sebep zorunludur.');
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(
          `${process.env['NEXT_PUBLIC_CONTROL_PLANE_API'] ?? 'http://localhost:4000'}/api/v1/super-admin/tenants/${tenantId}/suspend`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${document.cookie.replace(/(?:(?:^|.*;\s*)sa_token\s*=\s*([^;]*).*$)|^.*$/, '$1')}`,
            },
            body: JSON.stringify({ reason }),
          },
        );
        if (!res.ok) {
          const err = await res.json();
          setError(err.message ?? 'Askıya alma başarısız.');
          return;
        }
        // Reload page
        window.location.reload();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  if (!showDialog) {
    return (
      <button
        onClick={() => setShowDialog(true)}
        style={{
          padding: '0.5rem 1rem',
          background: '#dc2626',
          color: '#fff',
          border: 0,
          borderRadius: 6,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Askıya Al
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: '#fff',
          padding: '1.5rem',
          borderRadius: 8,
          maxWidth: 480,
          width: '90%',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Tenant'ı Askıya Al</h2>
        <p style={{ color: '#6b7280' }}>
          Bu işlem tenant'ın mağazasını devre dışı bırakır. Yeniden aktifleştirilebilir.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Sebep (zorunlu)"
          rows={3}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: '0.9375rem',
            fontFamily: 'inherit',
          }}
        />
        {error && (
          <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.5rem' }}>{error}</p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button
            onClick={() => {
              setShowDialog(false);
              setError(null);
              setReason('');
            }}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              color: '#111827',
              border: 0,
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            İptal
          </button>
          <button
            onClick={handleSuspend}
            disabled={isPending}
            style={{
              padding: '0.5rem 1rem',
              background: '#dc2626',
              color: '#fff',
              border: 0,
              borderRadius: 6,
              fontWeight: 500,
              cursor: isPending ? 'wait' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? 'Askıya alınıyor...' : 'Askıya Al'}
          </button>
        </div>
      </div>
    </div>
  );
}
