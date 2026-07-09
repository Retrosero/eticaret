/**
 * Türkçe müşteri vitrini — kök layout (SEO optimized).
 *
 * - Tüm sayfalarda geçerli meta tags (title template, description, OG, Twitter)
 * - JSON-LD Organization + WebSite schema (root'a bir kez)
 * - Webmaster tools verification
 * - Manifest, theme-color, vb.
 */
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { JsonLd } from '@/lib/seo';
import { organizationSchema, websiteSchema } from '@/lib/seo';
import { siteConfig } from '@/lib/seo';
import { getTenantBranding, brandingToCss } from '@/lib/branding';

// Next.js 15 — Viewport ayrı export gerekiyor
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  colorScheme: 'light dark',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    template: `%s | ${siteConfig.name}`,
    default: `${siteConfig.name} — Türkiye'nin Modern E-Ticaret Platformu`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    'eticart',
    'e-ticaret',
    'online mağaza',
    'B2B',
    'B2C',
    'bayi yönetimi',
    'e-fatura',
    'KVKK uyumlu',
    'çok kiracılı',
    'Türkiye e-ticaret',
    'online alışveriş',
  ],
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  category: 'e-commerce',
  classification: 'E-Ticaret SaaS Platformu',
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  // Manifest
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    other: [
      {
        rel: 'apple-touch-icon-precomposed',
        url: '/apple-touch-icon.png',
      },
    ],
  },
  // App links
  appLinks: {
    ios: { url: '/', app_store_id: '123456789' },
    android: { package_name: 'com.eticart.app' },
    web: { url: '/', should_fallback: true },
  },
  // Apple smart app banner
  other: {
    'apple-itunes-app': 'app-id=123456789',
  },
};

export default async function RootLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const branding = await getTenantBranding();
  return (
    <html lang="tr" dir="ltr">
      <head>
        {/* DNS prefetch — performans için */}
        <link rel="dns-prefetch" href="https://api.eticart.com.tr" />
        <link rel="preconnect" href="https://api.eticart.com.tr" crossOrigin="anonymous" />

        {/* JSON-LD — Organization + WebSite (root'a bir kez) */}
        <JsonLd
          id="seo-root"
          data={[organizationSchema(), websiteSchema()]}
        />
      </head>
      <body>
        <style
          dangerouslySetInnerHTML={{ __html: `:root{${brandingToCss(branding)}}${branding.customCss ?? ''}` }}
        />
        {children}
      </body>
    </html>
  );
}