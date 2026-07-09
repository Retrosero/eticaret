/**
 * Super Admin — Subscription Listesi.
 */
import { Card, Heading } from '@eticart/ui';
import { AdminShell } from '../layout';
import { requireSuperAdmin, getSuperAdminToken } from '../_lib/auth';

interface Subscription {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  current_period_end: string;
  trial_end_at: string | null;
  created_at: string;
}

async function fetchSubscriptions(status: string): Promise<Subscription[] | null> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  try {
    const res = await fetch(
      `${process.env['CONTROL_PLANE_API'] ?? 'http://localhost:4000'}/api/v1/super-admin/subscriptions?${params}`,
      {
        headers: { Authorization: `Bearer ${await getSuperAdminToken() ?? ''}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as Subscription[];
  } catch {
    return null;
  }
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: '#d1fae5', fg: '#065f46' },
  trialing: { bg: '#dbeafe', fg: '#1e40af' },
  past_due: { bg: '#fee2e2', fg: '#991b1b' },
  cancelled: { bg: '#e5e7eb', fg: '#1f2937' },
  expired: { bg: '#f3f4f6', fg: '#6b7280' },
};

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireSuperAdmin();
  const subs = await fetchSubscriptions(searchParams.status ?? '');

  return (
    <AdminShell current="/subscriptions">
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <Heading level={1}>Abonelikler</Heading>
          <p style={{ color: '#6b7280' }}>
            Tüm subscription kayıtları, durum ve periyot bilgileri.
          </p>
        </div>

        <Card padding={true} elevation="shadow">
          <form method="GET" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
              <option value="active">Aktif</option>
              <option value="trialing">Deneme</option>
              <option value="past_due">Ödeme Gecikmesi</option>
              <option value="cancelled">İptal</option>
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
          </form>
        </Card>

        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          {subs ? `${subs.length} kayıt` : 'Veri yüklenemedi'}
        </div>

        <Card padding={false} elevation="shadow">
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={th()}>Tenant</th>
                  <th style={th()}>Durum</th>
                  <th style={th()}>Periyot</th>
                  <th style={th()}>Bitiş Tarihi</th>
                  <th style={th()}>Trial Bitiş</th>
                </tr>
              </thead>
              <tbody>
                {!subs || subs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
                      Kayıt bulunamadı.
                    </td>
                  </tr>
                ) : (
                  subs.map((s) => {
                    const colors = STATUS_COLORS[s.status] ?? STATUS_COLORS['expired']!;
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={td()}>
                          <strong>{s.tenant_name}</strong>
                          <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>{s.tenant_slug}</div>
                        </td>
                        <td style={td()}>
                          <span
                            style={{
                              padding: '0.125rem 0.5rem',
                              background: colors.bg,
                              color: colors.fg,
                              borderRadius: 4,
                              fontSize: '0.75rem',
                              fontWeight: 500,
                            }}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td style={td()}>{s.billing_cycle}</td>
                        <td style={td()}>
                          {new Date(s.current_period_end).toLocaleDateString('tr-TR')}
                        </td>
                        <td style={td()}>
                          {s.trial_end_at
                            ? new Date(s.trial_end_at).toLocaleDateString('tr-TR')
                            : '—'}
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
    padding: '0.625rem 1rem',
    textAlign: 'left',
    fontWeight: 600,
    color: '#374151',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
  };
}

function td(): React.CSSProperties {
  return {
    padding: '0.625rem 1rem',
    verticalAlign: 'middle',
  };
}
