'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env['NEXT_PUBLIC_COMMERCE_BACKEND_API'] ?? 'http://localhost:3001';

function getToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|.*;\s*)ta_token\s*=\s*([^;]*).*$/) ?? [];
  return match[1] ?? '';
}

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (body.length < 1) {
      setError('Mesaj boş olamaz.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`${API_BASE}/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.message ?? 'Mesaj gönderilemedi.');
        return;
      }
      setBody('');
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      style={{
        background: '#fff',
        padding: '1.5rem',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <h3 style={{ margin: 0 }}>Yanıt Gönder</h3>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Mesajınız..."
        style={{
          padding: '0.625rem 0.75rem',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: '0.9375rem',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
      {error && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 6,
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={isPending}
        style={{
          alignSelf: 'flex-start',
          padding: '0.625rem 1.5rem',
          background: '#111827',
          color: '#fff',
          border: 0,
          borderRadius: 6,
          fontWeight: 500,
          cursor: isPending ? 'wait' : 'pointer',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? 'Gönderiliyor...' : 'Gönder'}
      </button>
    </form>
  );
}
