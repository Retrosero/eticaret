/**
 * Tenant Admin — Branding / White-Label Sayfası.
 */
import { Card, Heading } from '@eticart/ui';
import { BrandingClient } from './BrandingClient';

interface TenantBranding {
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

async function fetchBranding(): Promise<TenantBranding | null> {
  try {
    const res = await fetch(
      `${process.env['COMMERCE_BACKEND_API'] ?? 'http://localhost:3001'}/branding`,
      {
        headers: { Authorization: `Bearer ${process.env['TENANT_API_TOKEN'] ?? ''}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as TenantBranding;
  } catch {
    return null;
  }
}

export default async function BrandingPage() {
  const branding = await fetchBranding();

  if (!branding) {
    return (
      <div style={{ padding: '2rem' }}>
        <Heading level={1}>Branding</Heading>
        <p>Branding ayarları yüklenemedi.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <Heading level={1}>Branding (White-Label)</Heading>
        <p style={{ color: '#6b7280' }}>
          Marka kimliği, renkler, logo, font ve email görünümü.
        </p>
      </div>

      <BrandingClient initial={branding} />
    </div>
  );
}
