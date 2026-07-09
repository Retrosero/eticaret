'use client';

import { LogOut, Bell, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/auth-store';
import { useRouter } from 'next/navigation';

export function Header() {
  const router = useRouter();
  const { user, logout, tenantId } = useAuthStore();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-sm text-muted-foreground">
          {tenantId ? `Kiracı: ${tenantId.slice(0, 8)}…` : 'Süper Admin'}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Bildirimler">
          <Bell className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 rounded-full border bg-muted/30 pl-1 pr-3 py-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
            {user?.fullName?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="hidden md:flex flex-col items-start text-xs">
            <span className="font-medium leading-tight">{user?.fullName ?? 'Admin'}</span>
            <span className="text-muted-foreground leading-tight">
              {user?.role === 'super_admin'
                ? 'Süper Admin'
                : user?.role === 'tenant_admin'
                  ? 'Kiracı Yöneticisi'
                  : user?.role === 'manager'
                    ? 'Yönetici'
                    : 'Personel'}
            </span>
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </div>

        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Çıkış">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}