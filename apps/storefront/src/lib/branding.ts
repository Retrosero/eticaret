/**
 * Storefront Branding — Tenant white-label entegrasyonu.
 *
 * Bu dosya storefront tarafında tenant branding bilgisini:
 *  - Server component'ten alır (build time)
 *  - CSS variable string'e çevirir
 *  - Layout'ta inline `<style>` olarak inject eder
 *
 * Per-request tenant resolution:
 *  - Host header → subdomain
 *  - DB'den branding getir
 *  - CSS variable olarak döndür
 */
import { headers } from 'next/headers';

/** Tenant branding (commerce-backend API'den). */
export interface TenantBranding {
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
  social?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    youtube?: string;
    linkedin?: string;
    tiktok?: string;
  };
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
    whatsapp?: string;
  };
  customCss?: string;
}

const DEFAULT_BRANDING: TenantBranding = {
  brandName: 'EtiCart',
  colors: {
    primary: '#1f6feb',
    primaryForeground: '#ffffff',
    secondary: '#6b7280',
    accent: '#f59e0b',
    background: '#ffffff',
    surface: '#f6f8fa',
    text: '#1c1c1c',
    textMuted: '#6b7280',
    border: '#e5e7eb',
  },
  font: {
    family: 'Inter, system-ui, -apple-system, sans-serif',
    headingFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
  radius: 'md',
  email: {
    fromName: 'EtiCart',
    replyTo: 'noreply@eticart.com.tr',
    footerText: '© 2026 Eticart. Tüm hakları saklıdır.',
    accentColor: '#1f6feb',
  },
};

/**
 * Tenant branding'i server-side getir.
 * Server component'lerden çağrılır.
 */
export async function getTenantBranding(): Promise<TenantBranding> {
  // Subdomain → tenantId çözümleme
  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? 'localhost';
  const subdomain = extractSubdomain(host);
  if (!subdomain) return DEFAULT_BRANDING;

  // Reserved subdomain
  if (RESERVED_SUBDOMAINS.has(subdomain)) return DEFAULT_BRANDING;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _tenantId = subdomain;
  const apiUrl = process.env['COMMERCE_BACKEND_API'] ?? 'http://localhost:3001';

  try {
    const res = await fetch(`${apiUrl}/branding`, {
      headers: {
        'X-Forwarded-Host': host,
        // Internal token for service-to-service
        Authorization: `Bearer ${process.env['STOREFRONT_API_TOKEN'] ?? ''}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return DEFAULT_BRANDING;
    return (await res.json()) as TenantBranding;
  } catch {
    return DEFAULT_BRANDING;
  }
}

const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'app', 'admin', 'static', 'cdn', 'super', 'mail',
]);

function extractSubdomain(host: string): string | null {
  const base = process.env['ETICART_BASE_DOMAIN'] ?? 'eticart.com.tr';
  if (host === base) return null;
  if (host === `www.${base}`) return null;
  if (host.endsWith(`.${base}`)) {
    return host.slice(0, host.length - base.length - 1).split('.').pop() ?? null;
  }
  return null;
}

/**
 * Branding → CSS variable string.
 */
export function brandingToCss(b: TenantBranding): string {
  const radiusMap: Record<TenantBranding['radius'], string> = {
    none: '0px',
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '9999px',
  };
  return [
    `--eticart-color-primary: ${b.colors.primary};`,
    `--eticart-color-primary-foreground: ${b.colors.primaryForeground};`,
    `--eticart-color-secondary: ${b.colors.secondary};`,
    `--eticart-color-accent: ${b.colors.accent};`,
    `--eticart-color-background: ${b.colors.background};`,
    `--eticart-color-surface: ${b.colors.surface};`,
    `--eticart-color-text: ${b.colors.text};`,
    `--eticart-color-text-muted: ${b.colors.textMuted};`,
    `--eticart-color-border: ${b.colors.border};`,
    `--eticart-font-family: ${b.font.family};`,
    `--eticart-font-heading: ${b.font.headingFamily ?? b.font.family};`,
    `--eticart-radius: ${radiusMap[b.radius]};`,
  ].join(' ');
}

/**
 * Branding → Next.js metadata (favicon, title).
 */
export function brandingToMetadata(b: TenantBranding) {
  return {
    title: {
      default: b.brandName,
      template: `%s | ${b.brandName}`,
    },
    icons: b.faviconUrl
      ? { icon: b.faviconUrl }
      : undefined,
  };
}
