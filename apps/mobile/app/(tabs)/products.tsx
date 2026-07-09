import { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/api/client';
import { useOfflineQueueStore } from '@/store/offline-queue';

interface Product {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
  status: 'active' | 'low_stock' | 'out_of_stock';
}

const CURRENCY_FORMAT = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);

export default function ProductsScreen() {
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const queryClient = useQueryClient();
  const enqueue = useOfflineQueueStore((s) => s.enqueue);
  const online = useOfflineQueueStore((s) => s.online);
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});

  const { data, isLoading, refetch, isRefetching } = useQuery<Product[]>({
    queryKey: ['products', filter],
    queryFn: () => api.get<Product[]>('/mobile/products', filter === 'lowStock' ? { lowStock: true } : undefined),
  });

  const mutation = useMutation({
    mutationFn: ({ id, stock }: { id: string; stock: number }) =>
      api.patch(`/mobile/products/${id}/stock`, { stock }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
    onError: (err: any) => Alert.alert('Hata', err?.response?.data?.message ?? 'Stok güncellenemedi.'),
  });

  async function saveStock(id: string, currentStock: number) {
    const value = stockEdits[id];
    if (value === undefined) return;
    const newStock = parseInt(value, 10);
    if (Number.isNaN(newStock) || newStock < 0) {
      Alert.alert('Geçersiz', 'Stok 0 veya pozitif bir sayı olmalı.');
      return;
    }
    if (newStock === currentStock) return;

    if (online) {
      mutation.mutate({ id, stock: newStock });
    } else {
      await enqueue({
        type: 'product.updateStock',
        payload: { productId: id, quantity: newStock },
        createdAt: new Date().toISOString(),
      });
      Alert.alert('Çevrimdışı', 'Stok güncellemesi kuyruğa eklendi.');
    }
    setStockEdits((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  }

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(p) => p.id}
      style={styles.list}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{isLoading ? 'Yükleniyor...' : 'Ürün bulunamadı.'}</Text>
      }
      renderItem={({ item }) => {
        const lowStock = item.status === 'low_stock' || item.status === 'out_of_stock';
        return (
          <View style={[styles.row, lowStock && styles.rowAlert]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.sku}>{item.sku}</Text>
              <Text style={styles.price}>{CURRENCY_FORMAT(item.price)}</Text>
            </View>
            <View style={styles.stockCol}>
              <Text style={[styles.stockLabel, lowStock && styles.stockLabelAlert]}>
                Stok: {item.stock}
              </Text>
              <View style={styles.editRow}>
                <TextInput
                  style={styles.stockInput}
                  keyboardType="number-pad"
                  placeholder={String(item.stock)}
                  value={stockEdits[item.id] ?? ''}
                  onChangeText={(t) => setStockEdits((s) => ({ ...s, [item.id]: t }))}
                />
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={() => saveStock(item.id, item.stock)}
                >
                  <Text style={styles.saveText}>✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      }}
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
  rowAlert: { borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  productName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  sku: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  price: { fontSize: 13, fontWeight: '600', color: '#3b82f6', marginTop: 4 },
  stockCol: { alignItems: 'flex-end' },
  stockLabel: { fontSize: 12, color: '#6b7280' },
  stockLabelAlert: { color: '#ef4444', fontWeight: '600' },
  editRow: { flexDirection: 'row', marginTop: 4, alignItems: 'center' },
  stockInput: {
    width: 60,
    height: 36,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  saveButton: {
    width: 36,
    height: 36,
    backgroundColor: '#10b981',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  empty: { padding: 48, textAlign: 'center', color: '#9ca3af' },
});