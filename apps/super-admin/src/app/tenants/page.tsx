/**
 * Super Admin — Tenant Yönetim Sayfası.
 */
import { Card, Heading } from '@eticart/ui';
import { AdminShell } from '../layout';
import { requireSuperAdmin, getSuperAdminToken } from '../_lib/auth';
import Link from 'next/link';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  ownerEmail: string | null;
  createdAt: string;
  trialEndsAt: string | null;
}

interface TenantList {
  items: Tenant[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: '#d1fae5', fg: '#065f46' },
  trial: { bg: '#dbeafe', fg: '#1e40af' },
  provisioning: { bg: '#fef3c7', fg: '#92400e' },
  overdue: { bg: '#fee2e2', fg: '#991b1b' },
  suspended: { bg: '#f3f4f6', fg: '#374151' },
  cancelled: { bg: '#e5e7eb', fg: '#1f2937' },
  archived: { bg: '#e5e7eb', fg: '#6b7280' },
  draft: { bg: '#f3f4f6', fg: '#6b7280' },
};

async function fetchTenants(search: string, status: string): Promise<TenantList | null> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  params.set('limit', '50');

  try {
    const res = await fetch(
      `${process.env['CONTROL_PLANE_API'] ?? 'http://localhost:4000'}/api/v1/super-admin/tenants?${params}`,
      {
        headers: { Authorization: `Bearer ${await getSuperAdminToken() ?? ''}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as TenantList;
  } catch {
    return null;
  }
}

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: { search?: string; status?: string };
}) {
  await requireSuperAdmin();
  const data = await fetchTenants(searchParams.search ?? '', searchParams.status ?? '');

  return (
    <AdminShell current="/tenants">
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <Heading level={1}>Tenant Yönetimi</Heading>
          <p style={{ color: '#6b7280' }}>
            Tüm mağazaları görüntüle, filtrele ve yönet.
          </p>
        </div>

        {/* Filters */}
        <Card padding={true} elevation="shadow">
          <form
            method="GET"
            style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}
          >
            <input
              type="search"
              name="search"
              placeholder="Slug veya isim ara..."
              defaultValue={searchParams.search ?? ''}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                minWidth: 240,
                fontSize: '0.9375rem',
              }}
            />
            <select
              name="status"
              defaultValue={searchParams.status ?? ''}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: '0.9375rem',
              }}
            >
              <option value="">Tüm durumlar</option>
              <option value="trial">Trial</option>
              <option value="active">Aktif</option>
              <option value="provisioning">Provisioning</option>
              <option value="overdue">Ödeme Gecikmesi</option>
              <option value="suspended">Askıda</option>
              <option value="cancelled">İptal</option>
              <option value="archived">Arşiv</option>
            </select>
            <button
              type="submit"
              style={{
                padding: '0.5rem 1rem',
                background: '#111827',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Filtrele
            </button>
            <Link
              href="/tenants"
              style={{
                color: '#6b7280',
                textDecoration: 'none',
                fontSize: '0.875rem',
              }}
            >
              Sıfırla
            </Link>
          </form>
        </Card>

        {/* Stats */}
        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          {data ? (
            <>
              <strong>{data.total}</strong> tenant bulundu
              {data.items.length > 0 &&
                ` (${data.items.length} gösteriliyor)`}
            </>
          ) : (
            'Veri yüklenemedi'
          )}
        </div>

        {/* Table */}
        <Card padding={false} elevation="shadow">
          <div style={{ overflow: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.9375rem',
              }}
            >
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={th()}>Mağaza</th>
                  <th style={th()}>Plan</th>
                  <th style={th()}>Durum</th>
                  <th style={th()}>Sahibi</th>
                  <th style={th()}>Kayıt Tarihi</th>
                  <th style={th()}>Trial Bitiş</th>
                  <th style={th()}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {!data || data.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: '3rem 1rem',
                        textAlign: 'center',
                        color: '#6b7280',
                      }}
                    >
                      Tenant bulunamadı.
                    </td>
                  </tr>
                ) : (
                  data.items.map((t) => {
                    const colors = STATUS_COLORS[t.status] ?? STATUS_COLORS['draft']!;
                    return (
                      <tr
                        key={t.id}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={td()}>
                          <Link
                            href={`/tenants/${t.id}`}
                            style={{
                              color: '#111827',
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            {t.name}
                          </Link>
                          <div style={{ color: '#6b7280', fontSize: '0.8125rem' }}>
                            {t.slug}
                          </div>
                        </td>
                        <td style={td()}>
                          <span
                            style={{
                              padding: '0.125rem 0.5rem',
                              background: '#e5e7eb',
                              borderRadius: 4,
                              fontSize: '0.8125rem',
                              fontWeight: 500,
                            }}
                          >
                            {t.plan}
                          </span>
                        </td>
                        <td style={td()}>
                          <span
                            style={{
                              padding: '0.25rem 0.625rem',
                              background: colors.bg,
                              color: colors.fg,
                              borderRadius: 4,
                              fontSize: '0.8125rem',
                              fontWeight: 500,
                            }}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td style={{ ...td(), color: '#6b7280' }}>{t.ownerEmail ?? '—'}</td>
                        <td style={{ ...td(), color: '#6b7280' }}>
                          {new Date(t.createdAt).toLocaleDateString('tr-TR')}
                        </td>
                        <td style={{ ...td(), color: '#6b7280' }}>
                          {t.trialEndsAt
                            ? new Date(t.trialEndsAt).toLocaleDateString('tr-TR')
                            : '—'}
                        </td>
                        <td style={td()}>
                          <Link
                            href={`/tenants/${t.id}`}
                            style={{
                              color: '#2563eb',
                              textDecoration: 'none',
                              fontSize: '0.875rem',
                            }}
                          >
                            Detay →
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function th(): React.CSSProperties {
  return {
    padding: '0.75rem 1rem',
    textAlign: 'left',
    fontWeight: 600,
    color: '#374151',
    fontSize: '0.8125rem',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  };
}

function td(): React.CSSProperties {
  return {
    padding: '0.75rem 1rem',
    verticalAlign: 'middle',
  };
}
