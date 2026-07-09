/**
 * Auth Store — Zustand.
 *
 * Login, logout, 2FA, biometric toggle, kullanıcı bilgisi.
 */
import { create } from 'zustand';
import { api, tokenStorage } from '@/api/client';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'staff';
  twoFactorEnabled: boolean;
}

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  apiUrl: string;
}

interface AuthState {
  /** Auth durumu */
  status: 'idle' | 'authenticating' | 'authenticated' | 'unauthenticated';
  /** 2FA gerekli mi? */
  requires2FA: boolean;
  /** Mevcut kullanıcı */
  user: User | null;
  /** Mevcut tenant */
  tenant: TenantInfo | null;
  /** Son hata */
  error: string | null;
  /** Biometric açık mı? */
  biometricEnabled: boolean;

  /** Actions */
  login: (email: string, password: string, twoFactorCode?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  setBiometric: (enabled: boolean) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  requires2FA: false,
  user: null,
  tenant: null,
  error: null,
  biometricEnabled: false,

  async login(email, password, twoFactorCode) {
    set({ status: 'authenticating', error: null });
    try {
      const r = await api.login(email, password, twoFactorCode);
      set({
        status: 'authenticated',
        user: r.user,
        tenant: r.tenant,
        requires2FA: false,
        error: null,
      });
      return true;
    } catch (err: any) {
      const code = err?.response?.status;
      const message = err?.response?.data?.message ?? 'Giriş başarısız.';
      if (code === 401 && /2fa|two.factor/i.test(message)) {
        set({ status: 'unauthenticated', requires2FA: true, error: message });
      } else {
        set({ status: 'unauthenticated', error: message });
      }
      return false;
    }
  },

  async logout() {
    await api.logout();
    set({
      status: 'unauthenticated',
      user: null,
      tenant: null,
      requires2FA: false,
      error: null,
    });
  },

  async checkSession() {
    const token = await tokenStorage.getToken();
    if (!token) {
      set({ status: 'unauthenticated' });
      return;
    }
    try {
      const me = await api.get<{ user: User; tenant: TenantInfo }>('/auth/me');
      set({ status: 'authenticated', user: me.user, tenant: me.tenant });
    } catch {
      await tokenStorage.clear();
      set({ status: 'unauthenticated' });
    }
  },

  setBiometric(enabled) {
    set({ biometricEnabled: enabled });
  },

  clearError() {
    set({ error: null });
  },
}));