import { NextResponse } from 'next/server';
import { queryControlRows } from '@/lib/server/control-db';
import { verifyTenantAccessToken } from '@/lib/server/local-auth';

export const runtime = 'nodejs';

interface DbUserRow extends Record<string, unknown> {
  id: string;
  email: string;
  full_name: string;
  role: string;
  tenant_id: string | null;
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

export async function GET(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return NextResponse.json({ message: 'Yetkisiz.' }, { status: 401 });
  }

  const payload = await verifyTenantAccessToken(token);
  if (!payload?.sub) {
    return NextResponse.json({ message: 'Yetkisiz.' }, { status: 401 });
  }

  const rows = await queryControlRows<DbUserRow>(
    `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.tenant_id,
        u.status,
        t.name AS tenant_name,
        t.slug AS tenant_slug
      FROM public.users u
      LEFT JOIN public.tenants t ON t.id = u.tenant_id
      WHERE u.id = $1
      LIMIT 1
    `,
    [payload.sub],
  );

  const user = rows[0];
  if (!user || user.status !== 'active') {
    return NextResponse.json({ message: 'Yetkisiz.' }, { status: 401 });
  }

  return NextResponse.json({
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
