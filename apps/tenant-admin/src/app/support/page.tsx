/**
 * Tenant Admin — Destek Talepleri Listesi.
 */
import { Card, Heading } from '@eticart/ui';
import Link from 'next/link';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  customerEmail: string;
  customerName: string;
  messageCount?: number;
  lastMessageAt?: string | null;
  createdAt: string;
}

async function fetchTickets(): Promise<Ticket[]> {
  try {
    const res = await fetch(
      `${process.env['COMMERCE_BACKEND_API'] ?? 'http://localhost:3001'}/support/tickets?limit=50`,
      {
        headers: { Authorization: `Bearer ${process.env['TENANT_API_TOKEN'] ?? ''}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { items: Ticket[] };
    return data.items;
  } catch {
    return [];
  }
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#fee2e2', fg: '#991b1b' },
  assigned: { bg: '#dbeafe', fg: '#1e40af' },
  in_progress: { bg: '#dbeafe', fg: '#1e40af' },
  waiting_customer: { bg: '#fef3c7', fg: '#92400e' },
  resolved: { bg: '#d1fae5', fg: '#065f46' },
  closed: { bg: '#e5e7eb', fg: '#1f2937' },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#dc2626',
  high: '#f59e0b',
  normal: '#6b7280',
  low: '#9ca3af',
};

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Genel',
  billing: 'Fatura',
  technical: 'Teknik',
  feature_request: 'Özellik İsteği',
  bug_report: 'Hata Bildirimi',
  integration: 'Entegrasyon',
  other: 'Diğer',
};

export default async function SupportPage() {
  const tickets = await fetchTickets();

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Heading level={1}>Destek Talepleri</Heading>
          <p style={{ color: '#6b7280' }}>
            Eticart destek ekibiyle iletişim kurun.
          </p>
        </div>
        <Link
          href="/support/new"
          style={{
            padding: '0.5rem 1rem',
            background: '#111827',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          + Yeni Talep
        </Link>
      </div>

      <Card padding="none" elevation="shadow">
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th()}>Konu</th>
                <th style={th()}>Kategori</th>
                <th style={th()}>Öncelik</th>
                <th style={th()}>Durum</th>
                <th style={th()}>Mesajlar</th>
                <th style={th()}>Tarih</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
                    Henüz destek talebiniz yok.
                  </td>
                </tr>
              ) : (
                tickets.map((t) => {
                  const sc = STATUS_COLORS[t.status] ?? STATUS_COLORS['open']!;
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={td()}>
                        <Link
                          href={`/support/${t.id}`}
                          style={{ color: '#111827', textDecoration: 'none', fontWeight: 500 }}
                        >
                          {t.subject}
                        </Link>
                      </td>
                      <td style={td()}>{CATEGORY_LABELS[t.category] ?? t.category}</td>
                      <td style={td()}>
                        <span style={{ color: PRIORITY_COLORS[t.priority] ?? '#6b7280', fontWeight: 500 }}>
                          ● {t.priority}
                        </span>
                      </td>
                      <td style={td()}>
                        <span
                          style={{
                            padding: '0.125rem 0.5rem',
                            background: sc.bg,
                            color: sc.fg,
                            borderRadius: 4,
                            fontSize: '0.75rem',
                            fontWeight: 500,
                          }}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td style={td()}>{t.messageCount ?? 0}</td>
                      <td style={{ ...td(), color: '#6b7280' }}>
                        {new Date(t.createdAt).toLocaleDateString('tr-TR')}
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
