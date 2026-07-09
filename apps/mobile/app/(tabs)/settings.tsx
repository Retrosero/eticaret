import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { useAuthStore } from '@/store/auth';
import { useOfflineQueueStore } from '@/store/offline-queue';
import { api } from '@/api/client';

export default function SettingsScreen() {
  const { user, tenant, logout, biometricEnabled, setBiometric } = useAuthStore();
  const queue = useOfflineQueueStore((s) => s.queue);
  const flush = useOfflineQueueStore((s) => s.flush);
  const online = useOfflineQueueStore((s) => s.online);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    checkPushPermission();
  }, []);

  async function checkPushPermission() {
    const { status } = await Notifications.getPermissionsAsync();
    setPushEnabled(status === 'granted');
  }

  async function togglePush(value: boolean) {
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Bildirim izni verilmedi.');
        return;
      }
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId as string | undefined,
      });
      setPushToken(token.data);
      // Backend'e kaydet
      try {
        await api.post('/mobile/push/register', {
          token: token.data,
          platform: Constants.platform?.ios ? 'ios' : 'android',
        });
      } catch {
        // offline olabilir
      }
      setPushEnabled(true);
    } else {
      try {
        if (pushToken) {
          await api.post('/mobile/push/unregister', { token: pushToken });
        }
      } catch {
        // ignore
      }
      setPushEnabled(false);
    }
  }

  async function toggleBiometric(value: boolean) {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        Alert.alert('Biometric Yok', 'Cihazınızda biometric kimlik doğrulama ayarlı değil.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Biyometrik girişi aktifleştir',
      });
      if (!result.success) return;
    }
    setBiometric(value);
  }

  async function handleLogout() {
    Alert.alert('Çıkış', 'Çıkış yapmak istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  async function handleFlushQueue() {
    const r = await flush();
    Alert.alert('Senkronizasyon', `${r.flushed} aksiyon gönderildi, ${r.failed} başarısız.`);
  }

  return (
    <ScrollView style={styles.container}>
      {/* Profil */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Profil</Text>
        <Text style={styles.value}>{user?.fullName ?? '—'}</Text>
        <Text style={styles.muted}>{user?.email ?? '—'}</Text>
        <Text style={styles.muted}>{user?.role ?? '—'} · {tenant?.name ?? '—'}</Text>
      </View>

      {/* Bildirimler */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Bildirimler</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Push Bildirimleri</Text>
          <Switch value={pushEnabled} onValueChange={togglePush} />
        </View>
        {pushToken && <Text style={styles.muted} numberOfLines={1}>Token: {pushToken.slice(0, 32)}...</Text>}
      </View>

      {/* Güvenlik */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Güvenlik</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Biyometrik Giriş</Text>
          <Switch value={biometricEnabled} onValueChange={toggleBiometric} />
        </View>
      </View>

      {/* Çevrimdışı Kuyruk */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Çevrimdışı</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Bağlantı</Text>
          <Text style={[styles.statusBadge, { backgroundColor: online ? '#d1fae5' : '#fef3c7' }]}>
            {online ? '🟢 Online' : '🟡 Offline'}
          </Text>
        </View>
        <Text style={styles.muted}>Kuyrukta {queue.length} aksiyon bekliyor.</Text>
        {queue.length > 0 && (
          <TouchableOpacity style={styles.flushButton} onPress={handleFlushQueue}>
            <Text style={styles.flushText}>Şimdi Senkronize Et</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Çıkış */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </TouchableOpacity>

      <Text style={styles.version}>EtiCart Mobile v0.1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  card: { backgroundColor: '#fff', margin: 12, padding: 16, borderRadius: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase' },
  value: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  muted: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  label: { fontSize: 14, color: '#0f172a' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, fontSize: 12, fontWeight: '600' },
  flushButton: { marginTop: 12, padding: 12, backgroundColor: '#3b82f6', borderRadius: 6, alignItems: 'center' },
  flushText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  logoutButton: { margin: 16, padding: 16, backgroundColor: '#dc2626', borderRadius: 8, alignItems: 'center' },
  logoutText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  version: { textAlign: 'center', color: '#9ca3af', fontSize: 11, marginVertical: 16 },
});