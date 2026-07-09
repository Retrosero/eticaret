/**
 * Axios tabanlı API istemcisi.
 *
 * - JWT token otomatik olarak Authorization header'ına eklenir.
 * - X-Tenant-Id header'ı (opsiyonel tenant switching için) eklenir.
 * - 401 durumunda otomatik logout + login sayfasına yönlendirme.
 */
import axios, { AxiosError } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — token + tenant header ekle.
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('auth_token');
    const tenantId = window.localStorage.getItem('current_tenant_id');

    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    if (tenantId) {
      config.headers.set('X-Tenant-Id', tenantId);
    }
  }
  return config;
});

// Response interceptor — 401 → logout.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('auth_token');
      window.localStorage.removeItem('current_user');
      window.localStorage.removeItem('current_tenant_id');

      const path = window.location.pathname;
      if (!path.startsWith('/login')) {
        window.location.href = '/login?redirect=' + encodeURIComponent(path);
      }
    }
    return Promise.reject(error);
  },
);

/** Tip-yardımcıları — API'den dönen ortak tip. */
export interface ApiError {
  statusCode: number;
  errorCode: string;
  message: string;
}

export function extractApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Beklenmeyen hata';
}