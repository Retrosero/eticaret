'use client';

import { useState, useTransition } from 'react';
import { Card } from '@eticart/ui';

interface Branding {
  brandName: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  colors: {
    primary: string;
    primaryForeground: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    border: string;
  };
  font: {
    family: string;
    headingFamily?: string;
  };
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  email: {
    fromName: string;
    replyTo: string;
    footerText: string;
    logoUrl?: string;
    accentColor?: string;
  };
  social?: Record<string, string | undefined>;
  contact?: Record<string, string | undefined>;
  customCss?: string;
}

const API_BASE = process.env['NEXT_PUBLIC_COMMERCE_BACKEND_API'] ?? 'http://localhost:3001';
const RADII = ['none', 'sm', 'md', 'lg', 'xl', 'full'] as const;

function getToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|.*;\s*)ta_token\s*=\s*([^;]*).*$/) ?? [];
  return match[1] ?? '';
}

export function BrandingClient({ initial }: { initial: Branding }) {
  const [branding, setBranding] = useState<Branding>(initial);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  async function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(`${API_BASE}/branding`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(branding),
        });
        if (!res.ok) {
          const err = await res.json();
          setMessage({ type: 'error', text: err.message ?? 'Kayıt başarısız.' });
          return;
        }
        const updated = (await res.json()) as Branding;
        setBranding(updated);
        setMessage({ type: 'success', text: 'Branding kaydedildi.' });
      } catch (e) {
        setMessage({ type: 'error', text: (e as Error).message });
      }
    });
  }

  function updateColor(key: keyof Branding['colors'], value: string) {
    setBranding((b) => ({ ...b, colors: { ...b.colors, [key]: value } }));
  }
  function updateFont(key: keyof Branding['font'], value: string) {
    setBranding((b) => ({ ...b, font: { ...b.font, [key]: value } }));
  }
  function updateEmail(key: keyof Branding['email'], value: string) {
    setBranding((b) => ({ ...b, email: { ...b.email, [key]: value } }));
  }
  function updateSocial(key: string, value: string) {
    setBranding((b) => ({
      ...b,
      social: { ...(b.social ?? {}), [key]: value },
    }));
  }
  function updateContact(key: string, value: string) {
    setBranding((b) => ({
      ...b,
      contact: { ...(b.contact ?? {}), [key]: value },
    }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Live Preview */}
      <Card padding="lg" elevation="shadow">
        <h2 style={{ marginTop: 0 }}>Önizleme</h2>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem',
            background: branding.colors.background,
            border: `1px solid ${branding.colors.border}`,
            borderRadius: 'var(--eticart-radius, 0.5rem)',
          }}
        >
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt="Logo"
              style={{ maxHeight: 40, maxWidth: 120 }}
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                background: branding.colors.primary,
                color: branding.colors.primaryForeground,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                borderRadius: 'var(--eticart-radius, 0.5rem)',
              }}
            >
              {branding.brandName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 700, color: branding.colors.text }}>
              {branding.brandName}
            </div>
            <div style={{ fontSize: '0.875rem', color: branding.colors.textMuted }}>
              Marka sloganı buraya
            </div>
          </div>
          <button
            style={{
              marginLeft: 'auto',
              padding: '0.5rem 1rem',
              background: branding.colors.primary,
              color: branding.colors.primaryForeground,
              border: 0,
              borderRadius: 'var(--eticart-radius, 0.5rem)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Örnek Buton
          </button>
        </div>
      </Card>

      {/* Brand Name */}
      <Card padding="lg" elevation="shadow">
        <h2 style={{ marginTop: 0 }}>Marka</h2>
        <Field
          label="Marka adı"
          value={branding.brandName}
          onChange={(v) => setBranding((b) => ({ ...b, brandName: v }))}
        />
        <Field
          label="Logo URL (light)"
          value={branding.logoUrl ?? ''}
          onChange={(v) => setBranding((b) => ({ ...b, logoUrl: v }))}
        />
        <Field
          label="Logo URL (dark)"
          value={branding.logoDarkUrl ?? ''}
          onChange={(v) => setBranding((b) => ({ ...b, logoDarkUrl: v }))}
        />
        <Field
          label="Favicon URL"
          value={branding.faviconUrl ?? ''}
          onChange={(v) => setBranding((b) => ({ ...b, faviconUrl: v }))}
        />
      </Card>

      {/* Colors */}
      <Card padding="lg" elevation="shadow">
        <h2 style={{ marginTop: 0 }}>Renkler</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {Object.entries(branding.colors).map(([key, value]) => (
            <ColorField
              key={key}
              label={key}
              value={value}
              onChange={(v) => updateColor(key as keyof Branding['colors'], v)}
            />
          ))}
        </div>
      </Card>

      {/* Typography */}
      <Card padding="lg" elevation="shadow">
        <h2 style={{ marginTop: 0 }}>Tipografi</h2>
        <Field
          label="Font ailesi"
          value={branding.font.family}
          onChange={(v) => updateFont('family', v)}
          helpText="CSS font-family değeri (örn. 'Inter, sans-serif')"
        />
        <Field
          label="Başlık font ailesi"
          value={branding.font.headingFamily ?? ''}
          onChange={(v) => updateFont('headingFamily', v)}
        />
        <div>
          <label style={labelStyle}>Border radius</label>
          <select
            value={branding.radius}
            onChange={(e) =>
              setBranding((b) => ({ ...b, radius: e.target.value as Branding['radius'] }))
            }
            style={inputStyle}
          >
            {RADII.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Email */}
      <Card padding="lg" elevation="shadow">
        <h2 style={{ marginTop: 0 }}>Email</h2>
        <Field
          label="Gönderici adı"
          value={branding.email.fromName}
          onChange={(v) => updateEmail('fromName', v)}
        />
        <Field
          label="Reply-to adresi"
          value={branding.email.replyTo}
          onChange={(v) => updateEmail('replyTo', v)}
        />
        <Field
          label="Footer metni"
          value={branding.email.footerText}
          onChange={(v) => updateEmail('footerText', v)}
        />
        <Field
          label="Email logo URL"
          value={branding.email.logoUrl ?? ''}
          onChange={(v) => updateEmail('logoUrl', v)}
        />
      </Card>

      {/* Social */}
      <Card padding="lg" elevation="shadow">
        <h2 style={{ marginTop: 0 }}>Sosyal Medya</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {['instagram', 'twitter', 'facebook', 'youtube', 'linkedin', 'tiktok'].map(
            (key) => (
              <Field
                key={key}
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                value={branding.social?.[key] ?? ''}
                onChange={(v) => updateSocial(key, v)}
              />
            ),
          )}
        </div>
      </Card>

      {/* Contact */}
      <Card padding="lg" elevation="shadow">
        <h2 style={{ marginTop: 0 }}>İletişim</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {['phone', 'email', 'whatsapp', 'address'].map((key) => (
            <Field
              key={key}
              label={key.charAt(0).toUpperCase() + key.slice(1)}
              value={branding.contact?.[key] ?? ''}
              onChange={(v) => updateContact(key, v)}
            />
          ))}
        </div>
      </Card>

      {/* Custom CSS */}
      <Card padding="lg" elevation="shadow">
        <h2 style={{ marginTop: 0 }}>Özel CSS</h2>
        <textarea
          value={branding.customCss ?? ''}
          onChange={(e) => setBranding((b) => ({ ...b, customCss: e.target.value }))}
          rows={8}
          placeholder=".my-class { color: red; }"
          style={{
            ...inputStyle,
            fontFamily: 'monospace',
            fontSize: '0.875rem',
          }}
        />
        <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem' }}>
          Maksimum 10.000 karakter. CSS root'a inject edilir.
        </p>
      </Card>

      {message && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: message.type === 'success' ? '#d1fae5' : '#fee2e2',
            color: message.type === 'success' ? '#065f46' : '#991b1b',
            borderRadius: 6,
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ position: 'sticky', bottom: '1rem' }}>
        <button
          onClick={save}
          disabled={isPending}
          style={{
            padding: '0.75rem 2rem',
            background: '#111827',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontWeight: 500,
            fontSize: '0.9375rem',
            cursor: isPending ? 'wait' : 'pointer',
            opacity: isPending ? 0.6 : 1,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {isPending ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helpText?: string;
}) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
      {helpText && (
        <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem' }}>
          {helpText}
        </p>
      )}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 40,
            height: 36,
            border: '1px solid #d1d5db',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
        />
      </div>
    </div>
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
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: '0.9375rem',
};
