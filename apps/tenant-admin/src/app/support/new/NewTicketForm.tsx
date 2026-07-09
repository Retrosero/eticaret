'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env['NEXT_PUBLIC_COMMERCE_BACKEND_API'] ?? 'http://localhost:3001';

function getToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|.*;\s*)ta_token\s*=\s*([^;]*).*$/) ?? [];
  return match[1] ?? '';
}

const CATEGORIES = [
  { value: 'general', label: 'Genel soru' },
  { value: 'billing', label: 'Fatura / ödeme' },
  { value: 'technical', label: 'Teknik sorun' },
  { value: 'feature_request', label: 'Özellik isteği' },
  { value: 'bug_report', label: 'Hata bildirimi' },
  { value: 'integration', label: 'Entegrasyon' },
  { value: 'other', label: 'Diğer' },
];

const PRIORITIES = [
  { value: 'low', label: 'Düşük' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'urgent', label: 'Acil' },
];

export function NewTicketForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    subject: '',
    description: '',
    category: 'general',
    priority: 'normal',
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.subject.length < 5) {
      setError('Konu en az 5 karakter olmalı.');
      return;
    }
    if (form.description.length < 10) {
      setError('Açıklama en az 10 karakter olmalı.');
      return;
    }
    startTransition(async () => {
      const res = await fetch(`${API_BASE}/support/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.message ?? 'Talep oluşturulamadı.');
        return;
      }
      const ticket = await res.json();
      router.push(`/support/${ticket.id}`);
    });
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        maxWidth: 720,
      }}
    >
      <div>
        <label style={labelStyle}>Konu *</label>
        <input
          type="text"
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          placeholder="Kısa başlık (örn. 'Ödeme sırasında hata alıyorum')"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Kategori</label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            style={inputStyle}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Öncelik</label>
          <select
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            style={inputStyle}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Açıklama *</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={8}
          placeholder="Sorununuzu veya sorunuzu detaylı açıklayın. Mümkünse ekran görüntüsü linkleri de ekleyin."
          style={{
            ...inputStyle,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
        <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem' }}>
          En az 10 karakter. Mümkün olduğunca detaylı olun.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 6,
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: '0.75rem 2rem',
            background: '#111827',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontWeight: 500,
            cursor: isPending ? 'wait' : 'pointer',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? 'Gönderiliyor...' : 'Talebi Gönder'}
        </button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 500,
  marginBottom: '0.25rem',
  color: '#374151',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: '0.9375rem',
};
