'use client';

import { useState, useTransition } from 'react';

export function CreatePlanButton() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const body = {
      code: form.get('code'),
      name: form.get('name'),
      description: form.get('description'),
      monthlyPriceKurus: Number(form.get('monthlyPriceKurus')),
      yearlyPriceKurus: Number(form.get('yearlyPriceKurus')),
      currency: (form.get('currency') as string) || 'TRY',
      trialDays: Number(form.get('trialDays')),
      maxUsers: Number(form.get('maxUsers')),
      maxProducts: Number(form.get('maxProducts')),
      maxOrdersPerMonth: Number(form.get('maxOrdersPerMonth')),
      maxStorageBytes: Number(form.get('maxStorageBytes')),
      sortOrder: Number(form.get('sortOrder') ?? 100),
      isActive: true,
      features: [],
    };

    startTransition(async () => {
      try {
        const res = await fetch(
          `${process.env['NEXT_PUBLIC_CONTROL_PLANE_API'] ?? 'http://localhost:4000'}/api/v1/super-admin/plans`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${document.cookie.replace(/(?:(?:^|.*;\s*)sa_token\s*=\s*([^;]*).*$)|^.*$/, '$1')}`,
            },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const err = await res.json();
          setError(err.message ?? 'Plan oluşturulamadı.');
          return;
        }
        window.location.reload();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '0.5rem 1rem',
          background: '#111827',
          color: '#fff',
          border: 0,
          borderRadius: 6,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        + Yeni Plan
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
        padding: '1rem',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          padding: '2rem',
          borderRadius: 8,
          maxWidth: 600,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Yeni Plan</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <Field name="code" label="Kod" required placeholder="starter" />
          <Field name="name" label="Ad" required placeholder="Starter" />
          <Field
            name="description"
            label="Açıklama"
            required
            placeholder="Yeni başlayanlar için"
            fullWidth
          />
          <Field
            name="monthlyPriceKurus"
            label="Aylık fiyat (kuruş)"
            type="number"
            required
            placeholder="49900"
          />
          <Field
            name="yearlyPriceKurus"
            label="Yıllık fiyat (kuruş)"
            type="number"
            required
            placeholder="499000"
          />
          <Field name="currency" label="Para birimi" placeholder="TRY" defaultValue="TRY" />
          <Field
            name="trialDays"
            label="Deneme günü"
            type="number"
            required
            defaultValue="14"
          />
          <Field
            name="maxUsers"
            label="Maks kullanıcı"
            type="number"
            required
            defaultValue="2"
          />
          <Field
            name="maxProducts"
            label="Maks ürün"
            type="number"
            required
            defaultValue="100"
          />
          <Field
            name="maxOrdersPerMonth"
            label="Maks sipariş/ay"
            type="number"
            required
            defaultValue="500"
          />
          <Field
            name="maxStorageBytes"
            label="Maks depolama (byte)"
            type="number"
            required
            defaultValue="1073741824"
          />
          <Field
            name="sortOrder"
            label="Sıra"
            type="number"
            defaultValue="100"
          />
        </div>

        {error && (
          <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.5rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: 0,
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{
              padding: '0.5rem 1rem',
              background: '#111827',
              color: '#fff',
              border: 0,
              borderRadius: 6,
              fontWeight: 500,
              cursor: isPending ? 'wait' : 'pointer',
            }}
          >
            {isPending ? 'Oluşturuluyor...' : 'Oluştur'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  type = 'text',
  required,
  placeholder,
  defaultValue,
  fullWidth,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  fullWidth?: boolean;
}) {
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <label
        style={{
          display: 'block',
          fontSize: '0.8125rem',
          fontWeight: 500,
          marginBottom: '0.25rem',
        }}
      >
        {label}
        {required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: '0.9375rem',
        }}
      />
    </div>
  );
}
