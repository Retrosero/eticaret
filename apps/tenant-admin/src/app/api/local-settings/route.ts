import { NextResponse } from 'next/server';
import { queryControlRows, executeControlQuery } from '@/lib/server/control-db';
import { hashPassword, verifyTenantAccessToken } from '@/lib/server/local-auth';
import { buildTenantAdminSettings } from '@/lib/server/tenant-settings';
import type { TenantAdminSettings, TenantUserRole } from '@/lib/settings-types';

export const runtime = 'nodejs';

interface TenantSummaryRow extends Record<string, unknown> {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: string;
  tenant_plan: string;
  primary_domain: string | null;
  locale: string;
  currency: string;
  invoice_settings: Record<string, unknown> | null;
  kvkk_settings: Record<string, unknown> | null;
  email_settings: Record<string, unknown> | null;
  shipping_settings: Record<string, unknown> | null;
  custom_settings: Record<string, unknown> | null;
  user_full_name: string | null;
  user_email: string | null;
}

interface TeamMemberRow extends Record<string, unknown> {
  id: string;
  full_name: string;
  email: string;
  role: TenantUserRole;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

interface UpdatePayload extends TenantAdminSettings {
  newTeamMember?: {
    fullName: string;
    email: string;
    password: string;
    role: TenantUserRole;
  };
}

const ALLOWED_ROLES: TenantUserRole[] = ['tenant_owner', 'tenant_admin', 'tenant_staff'];

function getBearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function resolveAuth(request: Request) {
  const token = getBearerToken(request);
  if (!token) return null;
  return verifyTenantAccessToken(token);
}

async function loadSettings(tenantId: string, userId: string) {
  const rows = await queryControlRows<TenantSummaryRow>(
    `
      SELECT
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.status AS tenant_status,
        t.plan AS tenant_plan,
        t.primary_domain,
        t.locale,
        t.currency,
        ts.invoice_settings,
        ts.kvkk_settings,
        ts.email_settings,
        ts.shipping_settings,
        ts.custom_settings,
        u.full_name AS user_full_name,
        u.email AS user_email
      FROM public.tenants t
      LEFT JOIN public.tenant_settings ts ON ts.tenant_id = t.id
      LEFT JOIN public.users u ON u.id = $2
      WHERE t.id = $1
      LIMIT 1
    `,
    [tenantId, userId],
  );

  const teamRows = await queryControlRows<TeamMemberRow>(
    `
      SELECT
        id,
        full_name,
        email,
        role,
        status,
        last_login_at,
        created_at
      FROM public.users
      WHERE tenant_id = $1
      ORDER BY created_at ASC
    `,
    [tenantId],
  );

  const row = rows[0];
  if (!row) return null;

  return buildTenantAdminSettings(
    row,
    teamRows.map((member) => ({
      id: member.id,
      fullName: member.full_name,
      email: member.email,
      role: ALLOWED_ROLES.includes(member.role) ? member.role : 'tenant_staff',
      status: member.status,
      lastLoginAt: member.last_login_at,
      createdAt: member.created_at,
    })),
  );
}

function normalizeRole(role: string): TenantUserRole {
  return ALLOWED_ROLES.includes(role as TenantUserRole) ? (role as TenantUserRole) : 'tenant_staff';
}

function sanitizeSettings(body: UpdatePayload): UpdatePayload {
  return {
    ...body,
    tenant: {
      ...body.tenant,
      locale: body.tenant.locale || 'tr-TR',
      currency: body.tenant.currency || 'TRY',
    },
    invoice: {
      ...body.invoice,
      defaultTaxRate: Number(body.invoice.defaultTaxRate) || 0,
      taxCategories: (body.invoice.taxCategories ?? []).slice(0, 5).map((item, index) => ({
        id: item.id || `tax-${index + 1}`,
        name: item.name || `Kategori ${index + 1}`,
        rate: Number(item.rate) || 0,
      })),
    },
    payments: {
      ...body.payments,
      cashOnDelivery: {
        ...body.payments.cashOnDelivery,
        extraFee: Number(body.payments.cashOnDelivery.extraFee) || 0,
      },
    },
    shipping: {
      ...body.shipping,
      freeShippingLimit: Number(body.shipping.freeShippingLimit) || 0,
    },
    email: {
      ...body.email,
      port: Number(body.email.port) || 587,
    },
    kvkk: {
      ...body.kvkk,
      retentionDays: Number(body.kvkk.retentionDays) || 365,
    },
    teamMembers: (body.teamMembers ?? []).map((member) => ({
      ...member,
      role: normalizeRole(member.role),
    })),
    newTeamMember: body.newTeamMember
      ? {
          ...body.newTeamMember,
          email: body.newTeamMember.email.trim().toLowerCase(),
          role: normalizeRole(body.newTeamMember.role),
        }
      : undefined,
  };
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ message: 'Yetkisiz.' }, { status: 401 });
  }

  const settings = await loadSettings(auth.tenantId, auth.sub);
  if (!settings) {
    return NextResponse.json({ message: 'Tenant ayarlari bulunamadi.' }, { status: 404 });
  }

  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ message: 'Yetkisiz.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as UpdatePayload | null;
  if (!body) {
    return NextResponse.json({ message: 'Gecersiz ayar verisi.' }, { status: 400 });
  }

  const payload = sanitizeSettings(body);
  if (!payload.storeInfo.storeName.trim()) {
    return NextResponse.json({ message: 'Magaza adi zorunludur.' }, { status: 400 });
  }

  await executeControlQuery(
    `
      INSERT INTO public.tenant_settings
        (tenant_id, invoice_settings, kvkk_settings, email_settings, shipping_settings, custom_settings, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, NOW())
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        invoice_settings = EXCLUDED.invoice_settings,
        kvkk_settings = EXCLUDED.kvkk_settings,
        email_settings = EXCLUDED.email_settings,
        shipping_settings = EXCLUDED.shipping_settings,
        custom_settings = EXCLUDED.custom_settings,
        updated_at = NOW()
    `,
    [
      auth.tenantId,
      JSON.stringify(payload.invoice),
      JSON.stringify(payload.kvkk),
      JSON.stringify(payload.email),
      JSON.stringify(payload.shipping),
      JSON.stringify({
        storeInfo: payload.storeInfo,
        payments: payload.payments,
        notifications: payload.notifications,
      }),
    ],
  );

  await executeControlQuery(
    `
      UPDATE public.tenants
      SET name = $2, locale = $3, currency = $4, updated_at = NOW()
      WHERE id = $1
    `,
    [auth.tenantId, payload.storeInfo.storeName.trim(), payload.tenant.locale, payload.tenant.currency],
  );

  for (const member of payload.teamMembers) {
    await executeControlQuery(
      `
        UPDATE public.users
        SET role = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
      `,
      [normalizeRole(member.role), member.id, auth.tenantId],
    );
  }

  if (payload.newTeamMember) {
    const fullName = payload.newTeamMember.fullName.trim();
    const email = payload.newTeamMember.email.trim().toLowerCase();
    const password = payload.newTeamMember.password;

    if (!fullName || !email || !password) {
      return NextResponse.json(
        { message: 'Yeni kullanici icin ad, e-posta ve sifre zorunludur.' },
        { status: 400 },
      );
    }

    const existing = await queryControlRows<{ id: string }>(
      `SELECT id FROM public.users WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );

    if (existing.length > 0) {
      return NextResponse.json(
        { message: 'Bu e-posta ile kayitli bir kullanici zaten var.' },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    await executeControlQuery(
      `
        INSERT INTO public.users
          (email, full_name, role, tenant_id, password_hash, email_verified, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, TRUE, 'active', NOW(), NOW())
      `,
      [email, fullName, normalizeRole(payload.newTeamMember.role), auth.tenantId, passwordHash],
    );
  }

  const settings = await loadSettings(auth.tenantId, auth.sub);
  if (!settings) {
    return NextResponse.json({ message: 'Ayarlar kaydedildi ancak okunamadi.' }, { status: 500 });
  }

  return NextResponse.json(settings);
}
