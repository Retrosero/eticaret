/**
 * Tenant Admin — Analytics Dashboard.
 *
 * Satış, müşteri, ürün ve funnel analitikleri tek sayfada.
 */
import { Card, Heading, TrCurrency } from '@eticart/ui';
import { AnalyticsCharts } from './AnalyticsCharts';

interface SalesOverview {
  range: string;
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  uniqueCustomers: number;
  refunds: number;
  newVsReturning: { new: number; returning: number };
  dailySeries: Array<{ date: string; revenue: number; orders: number }>;
}

interface TopProduct {
  productId: string;
  productName: string;
  sku: string;
  imageUrl: string | null;
  unitsSold: number;
  revenue: number;
  orderCount: number;
}

interface Funnel {
  range: string;
  stages: Array<{
    name: string;
    count: number;
    conversionRate: number;
    dropoffRate: number;
  }>;
}

interface RealtimeStats {
  activeVisitors: number;
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  lastOrderAt: string | null;
}

async function fetchAnalytics(range: string): Promise<{
  overview: SalesOverview | null;
  topProducts: TopProduct[];
  funnel: Funnel | null;
  realtime: RealtimeStats | null;
}> {
  const base = process.env['COMMERCE_BACKEND_API'] ?? 'http://localhost:3001';
  const token = process.env['TENANT_API_TOKEN'] ?? '';
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [overviewRes, topRes, funnelRes, realtimeRes] = await Promise.all([
      fetch(`${base}/analytics/overview?range=${range}`, { headers, cache: 'no-store' }),
      fetch(`${base}/analytics/top-products?range=${range}&limit=10`, {
        headers,
        cache: 'no-store',
      }),
      fetch(`${base}/analytics/funnel?range=${range}`, { headers, cache: 'no-store' }),
      fetch(`${base}/analytics/realtime`, { headers, cache: 'no-store' }),
    ]);

    return {
      overview: overviewRes.ok ? await overviewRes.json() : null,
      topProducts: topRes.ok ? await topRes.json() : [],
      funnel: funnelRes.ok ? await funnelRes.json() : null,
      realtime: realtimeRes.ok ? await realtimeRes.json() : null,
    };
  } catch {
    return { overview: null, topProducts: [], funnel: null, realtime: null };
  }
}

const RANGE_LABELS: Record<string, string> = {
  '24h': 'Son 24 saat',
  '7d': 'Son 7 gün',
  '30d': 'Son 30 gün',
  '90d': 'Son 90 gün',
  '1y': 'Son 1 yıl',
  all: 'Tüm zamanlar',
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const range = searchParams.range ?? '30d';
  const { overview, topProducts, funnel, realtime } = await fetchAnalytics(range);

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Heading level={1}>Analitik Dashboard</Heading>
          <p style={{ color: '#6b7280' }}>{RANGE_LABELS[range] ?? range}</p>
        </div>
        <RangeSelector current={range} />
      </div>

      {/* Real-time Stats */}
      {realtime && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <StatBox label="Aktif Ziyaretçi" value={realtime.activeVisitors} accent />
          <StatBox label="Bugün Sipariş" value={realtime.todayOrders} />
          <StatBox
            label="Bugün Ciro"
            value={<TrCurrency amountKurus={realtime.todayRevenue} currency="TRY" />}
          />
          <StatBox label="Bekleyen Sipariş" value={realtime.pendingOrders} warning={realtime.pendingOrders > 10} />
        </div>
      )}

      {/* Sales Overview */}
      {overview && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <StatBox
            label="Toplam Ciro"
            value={<TrCurrency amountKurus={overview.totalRevenue} currency="TRY" />}
          />
          <StatBox label="Toplam Sipariş" value={overview.totalOrders} />
          <StatBox
            label="Ortalama Sepet"
            value={<TrCurrency amountKurus={overview.averageOrderValue} currency="TRY" />}
          />
          <StatBox label="Benzersiz Müşteri" value={overview.uniqueCustomers} />
          <StatBox label="Yeni Müşteri" value={overview.newVsReturning.new} success />
          <StatBox label="Geri Gelen Müşteri" value={overview.newVsReturning.returning} />
        </div>
      )}

      {/* Daily Series Chart */}
      {overview && overview.dailySeries.length > 0 && (
        <Card padding="lg" elevation="shadow">
          <h2 style={{ marginTop: 0 }}>Günlük Satış Trendi</h2>
          <AnalyticsCharts
            type="line"
            data={overview.dailySeries.map((d) => ({
              x: d.date,
              y: d.revenue / 100, // kuruş → TL
            }))}
            xLabel="Tarih"
            yLabel="Ciro (₺)"
          />
        </Card>
      )}

      {/* Conversion Funnel */}
      {funnel && (
        <Card padding="lg" elevation="shadow">
          <h2 style={{ marginTop: 0 }}>Conversion Funnel</h2>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {funnel.stages.map((stage, i) => {
              const maxCount = funnel.stages[0]?.count ?? 1;
              const widthPct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
              return (
                <div key={stage.name}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.25rem',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{stage.name}</span>
                    <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                      {stage.count.toLocaleString('tr-TR')}
                      {i > 0 && (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            color: stage.conversionRate >= 30 ? '#10b981' : '#f59e0b',
                            fontWeight: 500,
                          }}
                        >
                          %{stage.conversionRate.toFixed(1)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 24,
                      background: '#f3f4f6',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${widthPct}%`,
                        background: `hsl(${210 - i * 30}, 70%, 55%)`,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Top Products */}
      {topProducts.length > 0 && (
        <Card padding="none" elevation="shadow">
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ margin: 0 }}>En Çok Satan Ürünler</h2>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={th()}>Ürün</th>
                  <th style={th()}>SKU</th>
                  <th style={th()}>Adet</th>
                  <th style={th()}>Sipariş</th>
                  <th style={th()}>Ciro</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.productId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={td()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.productName}
                            style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              background: '#f3f4f6',
                              borderRadius: 4,
                            }}
                          />
                        )}
                        <span style={{ fontWeight: 500 }}>{p.productName}</span>
                      </div>
                    </td>
                    <td style={{ ...td(), fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {p.sku}
                    </td>
                    <td style={td()}>{p.unitsSold}</td>
                    <td style={td()}>{p.orderCount}</td>
                    <td style={td()}>
                      <strong>
                        <TrCurrency amountKurus={p.revenue} currency="TRY" />
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Export */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <a
          href={`${process.env['COMMERCE_BACKEND_API'] ?? 'http://localhost:3001'}/analytics/export/orders?range=${range}`}
          download
          style={{
            padding: '0.5rem 1rem',
            background: '#f3f4f6',
            color: '#111827',
            border: 0,
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.875rem',
          }}
        >
          📥 Siparişleri CSV İndir
        </a>
      </div>
    </div>
  );
}

function RangeSelector({ current }: { current: string }) {
  const ranges = [
    { value: '24h', label: '24s' },
    { value: '7d', label: '7g' },
    { value: '30d', label: '30g' },
    { value: '90d', label: '90g' },
    { value: '1y', label: '1y' },
  ];
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {ranges.map((r) => (
        <a
          key={r.value}
          href={`/analytics?range=${r.value}`}
          style={{
            padding: '0.375rem 0.75rem',
            background: current === r.value ? '#111827' : '#f3f4f6',
            color: current === r.value ? '#fff' : '#374151',
            border: 0,
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: '0.8125rem',
            fontWeight: current === r.value ? 500 : 400,
          }}
        >
          {r.label}
        </a>
      ))}
    </div>
  );
}

function StatBox({
  label,
  value,
  accent,
  success,
  warning,
}: {
  label: string;
  value: number | string | React.ReactNode;
  accent?: boolean;
  success?: boolean;
  warning?: boolean;
}) {
  const bg = accent ? '#dbeafe' : success ? '#d1fae5' : warning ? '#fef3c7' : '#f9fafb';
  const fg = accent ? '#1e40af' : success ? '#065f46' : warning ? '#92400e' : '#111827';
  return (
    <Card padding="md" elevation="sm" style={{ background: bg }}>
      <div style={{ color: fg, fontSize: '0.75rem', fontWeight: 500 }}>{label}</div>
      <div
        style={{
          color: '#111827',
          fontSize: '1.5rem',
          fontWeight: 700,
          marginTop: '0.25rem',
        }}
      >
        {value}
      </div>
    </Card>
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
