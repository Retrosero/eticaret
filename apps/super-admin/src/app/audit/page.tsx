/**
 * Super Admin — Audit Log Viewer.
 */
import { Card, Heading } from '@eticart/ui';
import { AdminShell } from '../layout';
import { requireSuperAdmin, getSuperAdminToken } from '../_lib/auth';

interface AuditEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  actor_email: string | null;
  tenant_slug: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface AuditResult {
  items: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

async function fetchAudit(
  action: string,
  resourceType: string,
): Promise<AuditResult | null> {
  const params = new URLSearchParams();
  if (action) params.set('action', action);
  if (resourceType) params.set('resourceType', resourceType);
  params.set('limit', '100');

  try {
    const res = await fetch(
      `${process.env['CONTROL_PLANE_API'] ?? 'http://localhost:4000'}/api/v1/super-admin/audit?${params}`,
      {
        headers: { Authorization: `Bearer ${await getSuperAdminToken() ?? ''}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as AuditResult;
  } catch {
    return null;
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { action?: string; resourceType?: string };
}) {
  await requireSuperAdmin();
  const data = await fetchAudit(
    searchParams.action ?? '',
    searchParams.resourceType ?? '',
  );

  return (
    <AdminShell current="/audit">
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <Heading level={1}>Audit Log</Heading>
          <p style={{ color: '#6b7280' }}>
            Tüm platform aksiyonları (KVKK uyumlu, değiştirilemez).
          </p>
        </div>

        <Card padding={true} elevation="shadow">
          <form
            method="GET"
            style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}
          >
            <input
              type="search"
              name="action"
              placeholder="Aksiyon ara (örn: tenant.create)"
              defaultValue={searchParams.action ?? ''}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                minWidth: 240,
                fontSize: '0.9375rem',
              }}
            />
            <select
              name="resourceType"
              defaultValue={searchParams.resourceType ?? ''}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: '0.9375rem',
              }}
            >
              <option value="">Tüm kaynaklar</option>
              <option value="tenant">Tenant</option>
              <option value="plan">Plan</option>
              <option value="subscription">Subscription</option>
              <option value="user">User</option>
              <option value="order">Order</option>
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
          {data ? (
            <>
              <strong>{data.total}</strong> kayıt bulundu
            </>
          ) : (
            'Veri yüklenemedi'
          )}
        </div>

        <Card padding={false} elevation="shadow">
          <div style={{ overflow: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.875rem',
              }}
            >
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={th()}>Zaman</th>
                  <th style={th()}>Aksiyon</th>
                  <th style={th()}>Kaynak</th>
                  <th style={th()}>Tenant</th>
                  <th style={th()}>Aktör</th>
                </tr>
              </thead>
              <tbody>
                {!data || data.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: '3rem 1rem',
                        textAlign: 'center',
                        color: '#6b7280',
                      }}
                    >
                      Kayıt bulunamadı.
                    </td>
                  </tr>
                ) : (
                  data.items.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ ...td(), color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {new Date(a.created_at).toLocaleString('tr-TR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td style={td()}>
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
                      </td>
                      <td style={{ ...td(), color: '#6b7280' }}>
                        {a.resource_type}
                        {a.resource_id && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                            ({a.resource_id.slice(0, 8)})
                          </span>
                        )}
                      </td>
                      <td style={td()}>{a.tenant_slug ?? '—'}</td>
                      <td style={{ ...td(), color: '#6b7280' }}>{a.actor_email ?? '—'}</td>
                    </tr>
                  ))
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
