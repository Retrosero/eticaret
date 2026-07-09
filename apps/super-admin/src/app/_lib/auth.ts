/**
 * Super Admin auth helper.
 *
 * Basit bearer token doğrulama (Phase 17).
 * Phase 18'de SSO + RBAC eklenecek.
 */
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'sa_token';
const TOKEN_HEADER = 'x-sa-token';

export async function getSuperAdminToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(COOKIE_NAME)?.value ?? null;
  if (fromCookie) return fromCookie;

  // Env fallback (server-side API call)
  return process.env['SUPER_ADMIN_TOKEN'] ?? null;
}

export async function requireSuperAdmin(): Promise<void> {
  const token = getSuperAdminToken();
  if (!token) {
    redirect('/login');
  }

  // Doğrula
  const res = await fetch(
    `${process.env['CONTROL_PLANE_API'] ?? 'http://localhost:4000'}/api/v1/super-admin/dashboard`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    redirect('/login');
  }
}

export const SA_TOKEN_COOKIE = COOKIE_NAME;
export const SA_TOKEN_HEADER = TOKEN_HEADER;
