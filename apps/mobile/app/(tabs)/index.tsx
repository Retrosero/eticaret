import { useQuery } from '@tanstack/react-query';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/api/client';

interface DashboardSummary {
  today: { revenue: number; orders: number; customers: number };
  yesterday: { revenue: number; orders: number };
  monthToDate: { revenue: number; orders: number };
  pendingOrders: number;
  lowStockProducts: number;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    total: number;
    status: string;
    createdAt: string;
  }>;
}

const CURRENCY_FORMAT = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);

export default function DashboardScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardSummary>('/mobile/dashboard'),
  });

  const change = data
    ? ((data.today.revenue - data.yesterday.revenue) / Math.max(data.yesterday.revenue, 1)) * 100
    : 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Bugün */}
      <Text style={styles.sectionTitle}>Bugün</Text>
      <View style={styles.statsRow}>
        <StatCard label="Ciro" value={data ? CURRENCY_FORMAT(data.today.revenue) : '—'} accent="#0f172a" />
        <StatCard label="Sipariş" value={data ? `${data.today.orders}` : '—'} accent="#3b82f6" />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Müşteri" value={data ? `${data.today.customers}` : '—'} accent="#10b981" />
        <StatCard
          label="Dün. Değişim"
          value={`${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(1)}%`}
          accent={change >= 0 ? '#10b981' : '#ef4444'}
        />
      </View>

      {/* Aylık */}
      <Text style={styles.sectionTitle}>Bu Ay</Text>
      <View style={styles.statsRow}>
        <StatCard
          label="Aylık Ciro"
          value={data ? CURRENCY_FORMAT(data.monthToDate.revenue) : '—'}
          accent="#7c3aed"
        />
        <StatCard
          label="Aylık Sipariş"
          value={data ? `${data.monthToDate.orders}` : '—'}
          accent="#ec4899"}
        />
      </View>

      {/* Bekleyen */}
      <Text style={styles.sectionTitle}>Bekleyen İşlemler</Text>
      <View style={styles.statsRow}>
        <TouchableOpacity
          style={[styles.statCard, { backgroundColor: '#fef3c7' }]}
          onPress={() => router.push('/(tabs)/orders?status=pending')}
        >
          <Text style={styles.statLabel}>Bekleyen Sipariş</Text>
          <Text style={[styles.statValue, { color: '#92400e' }]}>
            {data ? data.pendingOrders : '—'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statCard, { backgroundColor: '#fee2e2' }]}
          onPress={() => router.push('/(tabs)/products?filter=lowStock')}
        >
          <Text style={styles.statLabel}>Düşük Stok</Text>
          <Text style={[styles.statValue, { color: '#991b1b' }]}>
            {data ? data.lowStockProducts : '—'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Son Siparişler */}
      <Text style={styles.sectionTitle}>Son Siparişler</Text>
      {isLoading ? (
        <Text style={styles.loading}>Yükleniyor...</Text>
      ) : data?.recentOrders.length === 0 ? (
        <Text style={styles.empty}>Henüz sipariş yok.</Text>
      ) : (
        data?.recentOrders.map((order) => (
          <TouchableOpacity
            key={order.id}
            style={styles.orderRow}
            onPress={() => router.push(`/orders/${order.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
              <Text style={styles.orderCustomer}>{order.customerName}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.orderTotal}>{CURRENCY_FORMAT(order.total)}</Text>
              <Text style={styles.orderStatus}>{order.status}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: accent }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  statsRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    marginHorizontal: 4,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    minHeight: 80,
    justifyContent: 'center',
  },
  statLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '700' },
  orderRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  orderNumber: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  orderCustomer: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  orderTotal: { fontSize: 14, fontWeight: '600' },
  orderStatus: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  loading: { padding: 32, textAlign: 'center', color: '#6b7280' },
  empty: { padding: 32, textAlign: 'center', color: '#9ca3af' },
});