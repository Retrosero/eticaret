import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { api } from '@/api/client';
import { useOfflineQueueStore } from '@/store/offline-queue';

interface OrderDetail {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  total: number;
  status: string;
  items: Array<{ id: string; productName: string; quantity: number; price: number }>;
  createdAt: string;
  notes?: string;
}

const CURRENCY_FORMAT = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);

const NEXT_STATUS: Record<string, string> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'shipped',
  shipped: 'delivered',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Bekliyor',
  confirmed: 'Onaylandı',
  preparing: 'Hazırlanıyor',
  shipped: 'Kargoda',
  delivered: 'Teslim Edildi',
  cancelled: 'İptal',
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const enqueue = useOfflineQueueStore((s) => s.enqueue);
  const online = useOfflineQueueStore((s) => s.online);
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: ['order', id],
    queryFn: () => api.get<OrderDetail>(`/mobile/orders/${id}`),
  });

  const mutation = useMutation({
    mutationFn: ({ status, note }: { status: string; note?: string }) =>
      api.patch(`/mobile/orders/${id}/status`, { status, note }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: any) => {
      Alert.alert('Hata', err?.response?.data?.message ?? 'Güncellenemedi.');
    },
  });

  async function advanceStatus() {
    if (!data) return;
    const next = NEXT_STATUS[data.status];
    if (!next) {
      Alert.alert('Bilgi', 'Bu sipariş son durumda.');
      return;
    }
    if (online) {
      mutation.mutate({ status: next, note: note || undefined });
      setNote('');
    } else {
      // Offline → queue
      await enqueue({
        type: 'order.updateStatus',
        payload: { orderId: data.id, status: next, note: note || undefined },
        createdAt: new Date().toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'Çevrimdışı',
        'Sipariş durumu çevrimdışı kuyruğa eklendi. Online olunca otomatik gönderilecek.',
      );
      setNote('');
    }
  }

  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.orderNumber}>#{data.orderNumber}</Text>
        <Text style={styles.orderDate}>
          {new Date(data.createdAt).toLocaleString('tr-TR')}
        </Text>
      </View>

      {/* Customer */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Müşteri</Text>
        <Text style={styles.value}>{data.customerName}</Text>
        <Text style={styles.muted}>{data.customerPhone}</Text>
        <Text style={styles.muted}>{data.customerAddress}</Text>
      </View>

      {/* Items */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ürünler ({data.items.length})</Text>
        {data.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.productName}</Text>
            <Text style={styles.itemQty}>{item.quantity}x</Text>
            <Text style={styles.itemPrice}>{CURRENCY_FORMAT(item.price * item.quantity)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Toplam</Text>
          <Text style={styles.totalValue}>{CURRENCY_FORMAT(data.total)}</Text>
        </View>
      </View>

      {/* Status */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Durum</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusBadge}>{STATUS_LABEL[data.status] ?? data.status}</Text>
        </View>
        {NEXT_STATUS[data.status] && (
          <>
            <TextInput
              style={styles.noteInput}
              placeholder="Not (opsiyonel)"
              value={note}
              onChangeText={setNote}
              multiline
            />
            <TouchableOpacity
              style={[styles.advanceButton, mutation.isPending && styles.disabled]}
              onPress={advanceStatus}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.advanceText}>
                  → {STATUS_LABEL[NEXT_STATUS[data.status]!]}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {!online && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>📡 Çevrimdışı — değişiklikler kuyruğa eklendi</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  orderNumber: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  orderDate: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  card: { backgroundColor: '#fff', margin: 12, padding: 16, borderRadius: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase' },
  value: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  muted: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  itemName: { flex: 1, fontSize: 13, color: '#374151' },
  itemQty: { fontSize: 13, color: '#6b7280', marginHorizontal: 8 },
  itemPrice: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 },
  totalLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  totalValue: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  statusRow: { marginBottom: 12 },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#3b82f6',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    fontSize: 13,
    fontWeight: '600',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 60,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  advanceButton: { backgroundColor: '#10b981', padding: 14, borderRadius: 8, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  advanceText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  offlineBanner: { backgroundColor: '#fef3c7', padding: 12, margin: 12, borderRadius: 8 },
  offlineText: { color: '#92400e', fontSize: 13, textAlign: 'center' },
});