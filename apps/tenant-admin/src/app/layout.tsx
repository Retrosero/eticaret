import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EtiCart — Kiracı Yönetim Paneli',
  description: 'E-ticaret SaaS yönetim paneli',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}