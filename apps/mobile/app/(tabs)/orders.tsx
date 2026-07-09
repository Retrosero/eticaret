import { useQuery } from '@tanstack/react-query';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { api } from '@/api/client';

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
  status: string;
  itemCount: number;
  createdAt: string;
}

const CURRENCY_FORMAT = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  preparing: '#8b5cf6',
  shipped: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Bekliyor',
  confirmed: 'Onaylandı',
  preparing: 'Hazırlanıyor',
  shipped: 'Kargoda',
  delivered: 'Teslim Edildi',
  cancelled: 'İptal',
};

export default function OrdersScreen() {
  const router = useRouter();
  const { status } = useLocalSearchParams<{ status?: string }>();

  const { data, isLoading, refetch, isRefetching } = useQuery<Order[]>({
    queryKey: ['orders', status],
    queryFn: () =>
      api.get<Order[]>('/mobile/orders', status ? { status } : undefined),
  });

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(o) => o.id}
      style={styles.list}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{isLoading ? 'Yükleniyor...' : 'Sipariş bulunamadı.'}</Text>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push(`/orders/${item.id}`)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
            <Text style={styles.customer}>{item.customerName}</Text>
            <Text style={styles.meta}>{item.itemCount} ürün · {new Date(item.createdAt).toLocaleString('tr-TR')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.total}>{CURRENCY_FORMAT(item.total)}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: STATUS_COLOR[item.status] ?? '#6b7280' },
              ]}
            >
              <Text style={styles.statusText}>
                {STATUS_LABEL[item.status] ?? item.status}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f9fafb' },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 4,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  orderNumber: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  customer: { fontSize: 13, color: '#374151', marginTop: 2 },
  meta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  total: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  empty: { padding: 48, textAlign: 'center', color: '#9ca3af' },
});