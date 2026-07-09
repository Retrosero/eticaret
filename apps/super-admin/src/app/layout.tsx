import type { ReactNode } from 'react';
import Link from 'next/link';
import { Heading } from '@eticart/ui';
export const metadata = {
  title: 'EtiCart — Süper Admin',
};

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/tenants', label: 'Tenant\'lar', icon: '🏢' },
  { href: '/plans', label: 'Planlar', icon: '💎' },
  { href: '/subscriptions', label: 'Abonelikler', icon: '🔁' },
  { href: '/audit', label: 'Audit Log', icon: '📋' },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Layout'ta auth kontrolü (her sayfa için)
  // Login sayfası için bypass
  return (
    <html lang="tr">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}

export function AdminShell({ children, current }: { children: ReactNode; current: string }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 240,
          background: '#111827',
          color: '#f9fafb',
          padding: '1.5rem 1rem',
          position: 'sticky',
          top: 0,
          height: '100vh',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '0 0.5rem 1.5rem' }}>
          <Heading level={2} style={{ color: '#f9fafb' }}>
            EtiCart
          </Heading>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Süper Admin
          </p>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {NAV.map((item) => {
            const active = current === item.href || current.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 0.75rem',
                  borderRadius: 6,
                  background: active ? '#1f2937' : 'transparent',
                  color: active ? '#fff' : '#d1d5db',
                  textDecoration: 'none',
                  fontWeight: active ? 600 : 400,
                  fontSize: '0.9375rem',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: '1.125rem' }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            right: '1rem',
            padding: '0.75rem',
            background: '#1f2937',
            borderRadius: 6,
            fontSize: '0.75rem',
            color: '#9ca3af',
          }}
        >
          EtiCart v1.0.0
          <br />
          Phase 17 — Süper Admin
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
    </div>
  );
}
