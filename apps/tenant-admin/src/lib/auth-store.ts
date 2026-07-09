/**
 * Auth (kimlik doğrulama) Zustand store.
 *
 * - JWT token, kullanıcı bilgisi ve aktif tenant localStorage'da tutulur.
 * - Login/logout işlemleri backend API'sini çağırır.
 */
'use client';

import { create } from 'zustand';
import { apiClient, extractApiError } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'super_admin' | 'tenant_admin' | 'manager' | 'staff' | 'dealer_user';
  tenantId: string | null;
  /** Süper admin için tenant listesi. */
  tenants?: Array<{ id: string; name: string; slug: string }>;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  tenantId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  /** Login — token alır, kullanıcı bilgisini çeker. */
  login: (email: string, password: string) => Promise<boolean>;

  /** Mevcut kullanıcıyı tekrar yükle (sayfa yenilemede). */
  loadFromStorage: () => Promise<void>;

  /** Aktif tenant'ı değiştir (sadece super_admin için). */
  switchTenant: (tenantId: string) => void;

  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  tenantId: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  async login(email, password) {
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.post<{ accessToken: string; user: AuthUser }>('/auth/login', {
        email,
        password,
      });

      const { accessToken, user } = data;

      window.localStorage.setItem('auth_token', accessToken);
      window.localStorage.setItem('current_user', JSON.stringify(user));

      const tenantId = user.tenantId ?? user.tenants?.[0]?.id ?? null;
      if (tenantId) {
        window.localStorage.setItem('current_tenant_id', tenantId);
      }

      set({
        user,
        token: accessToken,
        tenantId,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      return true;
    } catch (err) {
      set({ isLoading: false, error: extractApiError(err) });
      return false;
    }
  },

  async loadFromStorage() {
    if (typeof window === 'undefined') return;
    const token = window.localStorage.getItem('auth_token');
    const userStr = window.localStorage.getItem('current_user');
    const tenantId = window.localStorage.getItem('current_tenant_id');

    if (!token || !userStr) return;

    try {
      const user = JSON.parse(userStr) as AuthUser;
      set({
        user,
        token,
        tenantId: tenantId ?? user.tenantId ?? null,
        isAuthenticated: true,
      });

      // Token'ın hala geçerli olduğunu doğrula
      try {
        await apiClient.get('/auth/me');
      } catch {
        // Token geçersiz — çıkış yap
        get().logout();
      }
    } catch {
      window.localStorage.removeItem('auth_token');
      window.localStorage.removeItem('current_user');
    }
  },

  switchTenant(tenantId) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('current_tenant_id', tenantId);
    }
    set({ tenantId });
  },

  logout() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('auth_token');
      window.localStorage.removeItem('current_user');
      window.localStorage.removeItem('current_tenant_id');
    }
    set({
      user: null,
      token: null,
      tenantId: null,
      isAuthenticated: false,
      error: null,
    });
  },
}));