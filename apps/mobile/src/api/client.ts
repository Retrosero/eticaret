/**
 * Mobile API Client — Tenant resolver + Axios interceptor.
 *
 * Multi-tenant subdomain yapısı:
 *   - Tenant login: subdomain'den (magaza.eticart.com.tr)
 *   - Token: SecureStore'da
 *   - Header: Authorization: Bearer <token>
 *   - X-Tenant-Id: <tenantId>
 */
import axios, { AxiosInstance, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

/** Tenant bilgisi. */
export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  apiUrl: string;
}

/** Login response. */
interface LoginResponse {
  token: string;
  refreshToken: string;
  tenant: TenantInfo;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: 'owner' | 'admin' | 'staff';
    twoFactorEnabled: boolean;
  };
}

const TOKEN_KEY = 'eticart_jwt_token';
const REFRESH_KEY = 'eticart_refresh_token';
const TENANT_KEY = 'eticart_tenant';

/**
 * API base URL.
 * Production'da tenant subdomain → eticart backend.
 * Development'ta ngrok veya LAN IP.
 */
function getApiBaseUrl(): string {
  const env = Constants.expoConfig?.extra?.['apiUrl'] as string | undefined;
  if (env) return env;
  return 'http://localhost:3001';
}

/**
 * Tenant resolver — kullanıcının subdomain/tenantId'sinden API URL çıkar.
 */
export const tenantResolver = {
  /**
   * Subdomain'den tenant slug çıkar.
   * "magaza.eticart.com.tr" → "magaza"
   */
  parseSubdomain(host: string): string | null {
    const parts = host.split('.');
    if (parts.length < 3) return null;
    const sub = parts[0];
    if (!sub || sub === 'www' || sub === 'app' || sub === 'admin') return null;
    return sub;
  },

  /**
   * Tenant bilgisini sakla.
   */
  async saveTenant(tenant: TenantInfo): Promise<void> {
    await SecureStore.setItemAsync(TENANT_KEY, JSON.stringify(tenant));
  },

  /**
   * Tenant bilgisini getir.
   */
  async getTenant(): Promise<TenantInfo | null> {
    const raw = await SecureStore.getItemAsync(TENANT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TenantInfo;
    } catch {
      return null;
    }
  },

  /**
   * Tenant'ı temizle (logout).
   */
  async clearTenant(): Promise<void> {
    await SecureStore.deleteItemAsync(TENANT_KEY);
  },
};

/**
 * Token storage — SecureStore (iOS Keychain / Android EncryptedSharedPreferences).
 */
export const tokenStorage = {
  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_KEY, token);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

/**
 * API client instance.
 */
class ApiClient {
  private instance: AxiosInstance;
  private refreshing: Promise<string | null> | null = null;

  constructor() {
    this.instance = axios.create({
      baseURL: getApiBaseUrl(),
      timeout: 30_000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Request interceptor — token + tenant header
    this.instance.interceptors.request.use(async (config) => {
      const token = await tokenStorage.getToken();
      const tenant = await tenantResolver.getTenant();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      if (tenant) config.headers['X-Tenant-Id'] = tenant.id;
      return config;
    });

    // Response interceptor — 401 → refresh
    this.instance.interceptors.response.use(
      (res) => res,
      async (error: AxiosError) => {
        if (error.response?.status !== 401) throw error;
        const original = error.config as any;
        if (original?._retry) throw error;

        const newToken = await this.refreshAccessToken();
        if (!newToken) {
          await tokenStorage.clear();
          throw error;
        }
        original._retry = true;
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return this.instance.request(original);
      },
    );
  }

  /**
   * Refresh token ile yeni access token al.
   */
  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const refreshToken = await tokenStorage.getRefreshToken();
        if (!refreshToken) return null;
        const r = await axios.post<{ token: string }>(
          `${getApiBaseUrl()}/auth/refresh`,
          { refreshToken },
          { timeout: 10_000 },
        );
        if (r.data?.token) {
          await tokenStorage.setToken(r.data.token);
          return r.data.token;
        }
        return null;
      } catch {
        return null;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  // ─── HTTP METODLARI ───

  get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.instance.get<T>(url, { params }).then((r) => r.data);
  }

  post<T>(url: string, body?: unknown): Promise<T> {
    return this.instance.post<T>(url, body).then((r) => r.data);
  }

  patch<T>(url: string, body?: unknown): Promise<T> {
    return this.instance.patch<T>(url, body).then((r) => r.data);
  }

  delete<T>(url: string): Promise<T> {
    return this.instance.delete<T>(url).then((r) => r.data);
  }

  /**
   * Login.
   */
  async login(email: string, password: string, twoFactorCode?: string): Promise<LoginResponse> {
    const r = await this.post<LoginResponse>('/auth/login', {
      email,
      password,
      twoFactorCode,
      deviceId: await this.getDeviceId(),
    });
    await tokenStorage.setToken(r.token);
    await tokenStorage.setRefreshToken(r.refreshToken);
    await tenantResolver.saveTenant(r.tenant);
    return r;
  }

  async logout(): Promise<void> {
    try {
      await this.post('/auth/logout');
    } catch {
      // ignore
    }
    await tokenStorage.clear();
    await tenantResolver.clearTenant();
  }

  /**
   * Cihaz ID (push notification için).
   */
  async getDeviceId(): Promise<string> {
    try {
      if (Application.applicationId) {
        return `${Application.applicationId}-${Application.nativeApplicationVersion ?? '1'}`;
      }
    } catch {
      // ignore
    }
    return 'unknown-device';
  }
}

export const api = new ApiClient();