import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { executeControlQuery, queryControlRows } from '@/lib/server/control-db';
import { signTenantAccessToken, verifyPassword } from '@/lib/server/local-auth';

export const runtime = 'nodejs';

interface LoginBody {
  email?: string;
  password?: string;
}

interface DbUserRow extends Record<string, unknown> {
  id: string;
  email: string;
  full_name: string;
  role: string;
  tenant_id: string | null;
  password_hash: string | null;
  status: string;
  tenant_name: string | null;
  tenant_slug: string | null;
}

function mapRole(role: string): 'super_admin' | 'tenant_admin' | 'manager' | 'staff' | 'dealer_user' {
  switch (role) {
    case 'super_admin':
      return 'super_admin';
    case 'tenant_staff':
      return 'staff';
    case 'tenant_owner':
    case 'tenant_admin':
    default:
      return 'tenant_admin';
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LoginBody;
  const email = body.email?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';

  if (!email || !password) {
    return NextResponse.json({ message: 'E-posta ve sifre zorunludur.' }, { status: 400 });
  }

  const rows = await queryControlRows<DbUserRow>(
    `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.tenant_id,
        u.password_hash,
        u.status,
        t.name AS tenant_name,
        t.slug AS tenant_slug
      FROM public.users u
      LEFT JOIN public.tenants t ON t.id = u.tenant_id
      WHERE lower(u.email) = $1
      LIMIT 1
    `,
    [email],
  );

  const user = rows[0];
  if (!user || !user.password_hash || user.status !== 'active') {
    return NextResponse.json({ message: 'Gecersiz giris bilgileri.' }, { status: 401 });
  }

  const isValidPassword = await verifyPassword(user.password_hash, password);
  if (!isValidPassword) {
    return NextResponse.json({ message: 'Gecersiz giris bilgileri.' }, { status: 401 });
  }

  const accessToken = await signTenantAccessToken(
    {
      sub: user.id,
      role: user.role,
      tenantId: user.tenant_id,
      identity: 'tenant',
      sessionId: randomUUID(),
      twoFactorVerified: true,
    },
  );

  await executeControlQuery(
    `
      UPDATE public.users
      SET last_login_at = NOW(), failed_login_count = 0, updated_at = NOW()
      WHERE id = $1
    `,
    [user.id],
  );

  return NextResponse.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: mapRole(user.role),
      tenantId: user.tenant_id,
      tenants:
        user.tenant_id && user.tenant_name && user.tenant_slug
          ? [{ id: user.tenant_id, name: user.tenant_name, slug: user.tenant_slug }]
          : [],
    },
  });
}
