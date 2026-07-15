'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

interface AuthGuardProps {
  children: React.ReactNode;
  /** Super admin sayfaları için: sadece super_admin rolü. */
  requireSuperAdmin?: boolean;
}

/**
 * AuthGuard — kimlik doğrulanmamış kullanıcıları /login'e yönlendirir.
 * Token localStorage'dan yüklendikten sonra içeriği render eder.
 */
export function AuthGuard({ children, requireSuperAdmin = false }: AuthGuardProps) {
  const router = useRouter();
  const { isAuthenticated, user, loadFromStorage } = useAuthStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setIsReady(true);
      return;
    }

    (async () => {
      await loadFromStorage();
      setIsReady(true);
    })();
  }, [isAuthenticated, loadFromStorage]);

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated) {
      const redirect = typeof window !== 'undefined' ? window.location.pathname : '/';
      router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }
    if (requireSuperAdmin && user?.role !== 'super_admin') {
      router.replace('/');
    }
  }, [isReady, isAuthenticated, user, requireSuperAdmin, router]);

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Yükleniyor…</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
