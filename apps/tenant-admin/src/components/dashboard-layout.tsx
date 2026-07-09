'use client';

import { Sidebar } from './sidebar';
import { Header } from './header';
import { AuthGuard } from './auth-guard';
import { useAuthStore } from '@/lib/auth-store';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s: any) => s.user);
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={user?.role} />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}