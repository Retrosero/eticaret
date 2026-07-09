/**
 * Super Admin — Tenant Detay Sayfası.
 */
import { Card, Heading } from '@eticart/ui';
import { AdminShell } from '../../layout';
import { requireSuperAdmin, getSuperAdminToken } from '../../_lib/auth';
import Link from 'next/link';
import { SuspendButton } from './SuspendButton';

interface TenantDetail {
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
    plan: string;
    ownerEmail: string | null;
    createdAt: string;
    trialEndsAt: string | null;
  };
  subscription: {
    id: string;
    planCode: string;
    status: string;
    trialEndAt: string | null;
    currentPeriodEnd: string;
  } | null;
  userCount: number;
  storageBytes: number;
  recentAudit: Array<{
    id: string;
    action: string;
    resource_type: string;
    actor_email: string;
    created_at: string;
  }>;
}

async function fetchTenant(id: string): Promise<TenantDetail | null> {
  try {
    const res = await fetch(
      `${process.env['CONTROL_PLANE_API'] ?? 'http://localhost:4000'}/api/v1/super-admin/tenants/${id}`,
      {
        headers: { Authorization: `Bearer ${await getSuperAdminToken() ?? ''}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as TenantDetail;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default async function TenantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireSuperAdmin();
  const data = await fetchTenant(params.id);
  if (!data) {
    return (
      <AdminShell current="/tenants">
        <div style={{ padding: '2rem' }}>
          <Heading level={1}>Tenant bulunamadı</Heading>
          <Link href="/tenants">← Tenant listesine dön</Link>
        </div>
      </AdminShell>
    );
  }

  const { tenant, subscription, userCount, storageBytes, recentAudit } = data;

  return (
    <AdminShell current="/tenants">
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <Link
            href="/tenants"
            style={{ color: '#6b7280', textDecoration: 'none', fontSize: '0.875rem' }}
          >
            ← Tenant listesi
          </Link>
          <Heading level={1} style={{ marginTop: '0.5rem' }}>
            {tenant.name}
          </Heading>
          <p style={{ color: '#6b7280' }}>
            <code style={{ background: '#f3f4f6', padding: '0.125rem 0.375rem', borderRadius: 4 }}>
              {tenant.slug}.eticart.com.tr
            </code>
          </p>
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {tenant.status === 'suspended' ? (
            <form action="/api/super-admin/reactivate" method="post">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <button
                type="submit"
                style={{
                  padding: '0.5rem 1rem',
                  background: '#10b981',
                  color: '#fff',
                  border: 0,
                  borderRadius: 6,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Yeniden Aktifleştir
              </button>
            </form>
          ) : (
            <SuspendButton tenantId={tenant.id} />
          )}
        </div>

        {/* Info grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem',
          }}
        >
          <Card padding={true} elevation="shadow">
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Plan</h3>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0' }}>
              {tenant.plan}
            </p>
            {subscription && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {subscription.status} —{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString('tr-TR')} bitiş
              </p>
            )}
          </Card>
          <Card padding={true} elevation="shadow">
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Kullanıcı</h3>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0' }}>
              {userCount}
            </p>
          </Card>
          <Card padding={true} elevation="shadow">
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Depolama</h3>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0' }}>
              {formatBytes(storageBytes)}
            </p>
          </Card>
          <Card padding={true} elevation="shadow">
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Kayıt Tarihi</h3>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0' }}>
              {new Date(tenant.createdAt).toLocaleDateString('tr-TR')}
            </p>
            {tenant.trialEndsAt && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Trial bitiş: {new Date(tenant.trialEndsAt).toLocaleDateString('tr-TR')}
              </p>
            )}
          </Card>
        </div>

        {/* Recent audit */}
        <Card padding={true} elevation="shadow">
          <Heading level={2}>Son Aktiviteler</Heading>
          {recentAudit.length === 0 ? (
            <p style={{ color: '#6b7280', marginTop: '1rem' }}>Henüz aktivite yok.</p>
          ) : (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
              {recentAudit.slice(0, 15).map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid #f3f4f6',
                    fontSize: '0.875rem',
                  }}
                >
                  <div>
                    <code
                      style={{
                        background: '#f3f4f6',
                        padding: '0.125rem 0.375rem',
                        borderRadius: 4,
                        fontSize: '0.8125rem',
                      }}
                    >
                      {a.action}
                    </code>
                    {a.actor_email && (
                      <span style={{ marginLeft: '0.75rem', color: '#6b7280' }}>
                        {a.actor_email}
                      </span>
                    )}
                  </div>
                  <time style={{ color: '#6b7280', fontSize: '0.8125rem' }}>
                    {new Date(a.created_at).toLocaleString('tr-TR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </time>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
