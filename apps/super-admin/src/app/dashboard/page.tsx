/**
 * Super Admin Dashboard.
 *
 * Server component — control-plane API'den dashboard verisi çeker.
 * Authentication gerekli (cookie/session veya Bearer token).
 */
import { Card, Heading, TrCurrency } from '@eticart/ui';
import { requireSuperAdmin } from '../_lib/auth';

interface DashboardData {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  overdueTenants: number;
  mrrKurus: number;
  arrKurus: number;
  signupsLast24h: number;
  signupsLast7d: number;
  churnRate30d: number;
  storageUsedBytes: number;
  tenantsByPlan: Array<{ planCode: string; count: number }>;
  recentActivity: Array<{
    tenantId: string;
    slug: string;
    action: string;
    at: string;
  }>;
}

async function fetchDashboard(): Promise<DashboardData | null> {
  try {
    const res = await fetch(
      `${process.env['CONTROL_PLANE_API'] ?? 'http://localhost:4000'}/api/v1/super-admin/dashboard`,
      {
        headers: { Authorization: `Bearer ${process.env['SUPER_ADMIN_TOKEN'] ?? ''}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as DashboardData;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card padding={true} elevation="shadow">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span
          style={{
            color: 'var(--color-text-muted, #6b7280)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        <span
          style={{
            color: 'var(--color-text, #111)',
            fontSize: '1.875rem',
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          {value}
        </span>
        {hint && (
          <span
            style={{
              color: 'var(--color-text-muted, #6b7280)',
              fontSize: '0.75rem',
            }}
          >
            {hint}
          </span>
        )}
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  await requireSuperAdmin();
  const data = await fetchDashboard();

  if (!data) {
    return (
      <div style={{ padding: '2rem' }}>
        <Heading level={1}>Dashboard</Heading>
        <p>Veri yüklenemedi. Control-plane API erişilebilir mi?</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <Heading level={1}>Platform Dashboard</Heading>
        <p style={{ color: 'var(--color-text-muted, #6b7280)' }}>
          {new Date().toLocaleString('tr-TR', { dateStyle: 'full', timeStyle: 'short' })}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <StatCard
          label="Toplam Tenant"
          value={data.totalTenants}
          hint={`${data.activeTenants} aktif, ${data.trialTenants} trial`}
        />
        <StatCard
          label="MRR"
          value={
            <TrCurrency
              amount={data.mrrKurus}
              currency="TRY"
              
            />
          }
          hint={`ARR: ${(data.arrKurus / 100).toLocaleString('tr-TR')} ₺`}
        />
        <StatCard
          label="Yeni Kayıt (24s)"
          value={data.signupsLast24h}
          hint={`Son 7 gün: ${data.signupsLast7d}`}
        />
        <StatCard
          label="Churn (30 gün)"
          value={`%${data.churnRate30d.toFixed(2)}`}
          hint="İptal / Aktif oranı"
        />
        <StatCard
          label="Askıda"
          value={data.suspendedTenants}
          hint={data.overdueTenants > 0 ? `${data.overdueTenants} ödeme gecikmesi` : '—'}
        />
        <StatCard
          label="Toplam Depolama"
          value={formatBytes(data.storageUsedBytes)}
          hint="R2/S3 kullanımı"
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem',
        }}
      >
        <Card padding={true} elevation="shadow">
          <Heading level={2}>Plan Dağılımı</Heading>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.tenantsByPlan.length === 0 ? (
              <p>Henüz tenant yok.</p>
            ) : (
              data.tenantsByPlan.map((p) => (
                <div
                  key={p.planCode}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--color-border, #e5e7eb)',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{p.planCode}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{p.count} tenant</span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card padding={true} elevation="shadow">
          <Heading level={2}>Son Aktiviteler</Heading>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.recentActivity.length === 0 ? (
              <p>Henüz aktivite yok.</p>
            ) : (
              data.recentActivity.slice(0, 10).map((a, i) => (
                <div
                  key={`${a.tenantId}-${i}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--color-border, #e5e7eb)',
                    fontSize: '0.875rem',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 500 }}>{a.slug}</span>
                    <span
                      style={{
                        marginLeft: '0.5rem',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {a.action}
                    </span>
                  </div>
                  <time style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                    {new Date(a.at).toLocaleString('tr-TR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </time>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
