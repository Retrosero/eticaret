/**
 * Tenant Admin — Ticket Detayı.
 */
import { Card, Heading } from '@eticart/ui';
import { notFound } from 'next/navigation';
import { TicketReplyForm } from './TicketReplyForm';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  customerEmail: string;
  customerName: string;
  createdAt: string;
}

interface Message {
  id: string;
  authorType: string;
  authorEmail: string;
  authorName: string;
  body: string;
  createdAt: string;
  isInternal: boolean;
}

async function fetchTicket(id: string): Promise<{ ticket: Ticket; messages: Message[] } | null> {
  try {
    const base = process.env['COMMERCE_BACKEND_API'] ?? 'http://localhost:3001';
    const headers = { Authorization: `Bearer ${process.env['TENANT_API_TOKEN'] ?? ''}` };
    const [tRes, mRes] = await Promise.all([
      fetch(`${base}/support/tickets/${id}`, { headers, cache: 'no-store' }),
      fetch(`${base}/support/tickets/${id}/messages`, { headers, cache: 'no-store' }),
    ]);
    if (!tRes.ok || !mRes.ok) return null;
    return {
      ticket: await tRes.json(),
      messages: await mRes.json(),
    };
  } catch {
    return null;
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

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const data = await fetchTicket(params.id);
  if (!data) notFound();

  const { ticket, messages } = data;
  const statusColor = STATUS_COLORS[ticket.status] ?? STATUS_COLORS['open']!;

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <Heading level={1}>{ticket.subject}</Heading>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
          <span
            style={{
              padding: '0.25rem 0.625rem',
              background: statusColor.bg,
              color: statusColor.fg,
              borderRadius: 4,
              fontSize: '0.75rem',
              fontWeight: 500,
            }}
          >
            {ticket.status}
          </span>
          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {ticket.priority} · {ticket.category}
          </span>
          <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
            {new Date(ticket.createdAt).toLocaleString('tr-TR')}
          </span>
        </div>
      </div>

      <Card padding="lg" elevation="shadow">
        <h2 style={{ marginTop: 0 }}>Mesaj Geçmişi</h2>
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                padding: '0.75rem 1rem',
                background: m.authorType === 'customer' ? '#f0f9ff' : '#f9fafb',
                borderLeft: `3px solid ${m.authorType === 'customer' ? '#1f6feb' : '#10b981'}`,
                borderRadius: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <strong style={{ fontSize: '0.875rem' }}>{m.authorName}</strong>
                <time style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  {new Date(m.createdAt).toLocaleString('tr-TR')}
                </time>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9375rem', lineHeight: 1.5 }}>
                {m.body}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {ticket.status !== 'closed' && <TicketReplyForm ticketId={ticket.id} />}
    </div>
  );
}
