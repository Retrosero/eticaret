'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  FileText,
  Building2,
  Settings,
  Truck,
  Tags,
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Genel Bakis', href: '/', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Urunler', href: '/products', icon: <Package className="h-4 w-4" /> },
  { label: 'Kategoriler', href: '/categories', icon: <Tags className="h-4 w-4" /> },
  { label: 'Markalar', href: '/brands', icon: <Tags className="h-4 w-4" /> },
  { label: 'Siparisler', href: '/orders', icon: <ShoppingCart className="h-4 w-4" /> },
  { label: 'Musteriler', href: '/customers', icon: <Users className="h-4 w-4" /> },
  { label: 'Faturalar', href: '/invoices', icon: <FileText className="h-4 w-4" /> },
  { label: 'Kargo', href: '/shipping', icon: <Truck className="h-4 w-4" /> },
  {
    label: 'B2B Bayi',
    href: '/b2b',
    icon: <Building2 className="h-4 w-4" />,
    roles: ['super_admin', 'tenant_admin', 'manager'],
  },
  { label: 'Ayarlar', href: '/settings', icon: <Settings className="h-4 w-4" /> },
  { label: 'Temalar', href: '/themes', icon: <Palette className="h-4 w-4" />, roles: ['super_admin', 'tenant_admin'] },
];

interface SidebarProps {
  role?: string;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    if (!role) return false;
    return item.roles.includes(role);
  });

  return (
    <aside className="hidden md:flex w-60 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          E
        </div>
        <span className="font-semibold">EtiCart Admin</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 text-xs text-muted-foreground">v0.1.0 - Faz 11</div>
    </aside>
  );
}
