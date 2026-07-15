'use client';

import { create } from 'zustand';
import { apiClient, extractApiError } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'super_admin' | 'tenant_admin' | 'manager' | 'staff' | 'dealer_user';
  tenantId: string | null;
  tenants?: Array<{ id: string; name: string; slug: string }>;
}

const LOCAL_AUTH_MODE = 'local-db';

function isJwtExpired(token: string): boolean {
  try {
    const [, payload] = token.split('.');
    if (!payload) return true;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(window.atob(normalized)) as { exp?: number };

    if (typeof decoded.exp !== 'number') return false;
    return decoded.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  tenantId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  loadFromStorage: () => Promise<void>;
  switchTenant: (tenantId: string) => void;
  logout: () => void;
}

async function loginWithLocalAuth(email: string, password: string): Promise<{ accessToken: string; user: AuthUser }> {
  const response = await fetch('/api/local-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = (await response.json().catch(() => ({}))) as
    | { accessToken: string; user: AuthUser }
    | { message?: string };

  if (!response.ok || !('accessToken' in data) || !('user' in data)) {
    throw new Error('message' in data && data.message ? data.message : 'Giris basarisiz.');
  }

  return data;
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
      const { accessToken, user } = await loginWithLocalAuth(email, password);

      window.localStorage.setItem('auth_token', accessToken);
      window.localStorage.setItem('current_user', JSON.stringify(user));
      window.localStorage.setItem('auth_mode', LOCAL_AUTH_MODE);

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
    } catch (error) {
      set({ isLoading: false, error: extractApiError(error) });
      return false;
    }
  },

  async loadFromStorage() {
    if (typeof window === 'undefined') return;

    const token = window.localStorage.getItem('auth_token');
    const userStr = window.localStorage.getItem('current_user');
    const tenantId = window.localStorage.getItem('current_tenant_id');
    const authMode = window.localStorage.getItem('auth_mode');

    if (!token || !userStr) return;

    try {
      const user = JSON.parse(userStr) as AuthUser;
      const resolvedTenantId = tenantId ?? user.tenantId ?? null;

      set({
        user,
        token,
        tenantId: resolvedTenantId,
        isAuthenticated: true,
      });

      try {
        if (authMode === LOCAL_AUTH_MODE) {
          if (isJwtExpired(token)) {
            throw new Error('Yetkisiz');
          }
        } else {
          await apiClient.get('/auth/me');
        }
      } catch {
        get().logout();
      }
    } catch {
      window.localStorage.removeItem('auth_token');
      window.localStorage.removeItem('current_user');
      window.localStorage.removeItem('current_tenant_id');
      window.localStorage.removeItem('auth_mode');
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
      window.localStorage.removeItem('auth_mode');
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
