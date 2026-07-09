import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '@/store/auth';

export default function LoginScreen() {
  const router = useRouter();
  const { login, requires2FA, error, status, clearError, biometricEnabled, setBiometric } =
    useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  async function handleLogin() {
    if (requires2FA) {
      await login(email, password, code);
    } else {
      await login(email, password);
    }
    const s = useAuthStore.getState();
    if (s.status === 'authenticated') router.replace('/(tabs)');
  }

  async function handleBiometric() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      alert('Bu cihazda biyometrik kimlik doğrulama yok.');
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'EtiCart\'a giriş yap',
      fallbackLabel: 'Şifre kullan',
    });
    if (result.success) {
      setBiometric(true);
      // Biometric başarılı → şifreyi tekrar gir (veya stored token)
      // Demo: yine de email/password iste
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>EtiCart</Text>
        <Text style={styles.subtitle}>Mağaza Yönetimi</Text>

        {!requires2FA ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="E-posta"
              value={email}
              onChangeText={(t) => {
                clearError();
                setEmail(t);
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={status !== 'authenticating'}
            />
            <TextInput
              style={styles.input}
              placeholder="Şifre"
              value={password}
              onChangeText={(t) => {
                clearError();
                setPassword(t);
              }}
              secureTextEntry
              autoComplete="password"
              editable={status !== 'authenticating'}
            />
          </>
        ) : (
          <TextInput
            style={styles.input}
            placeholder="2FA Kodu (6 haneli)"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            editable={status !== 'authenticating'}
          />
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, status === 'authenticating' && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={status === 'authenticating'}
        >
          {status === 'authenticating' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {requires2FA ? 'Doğrula' : 'Giriş Yap'}
            </Text>
          )}
        </TouchableOpacity>

        {biometricEnabled && !requires2FA && (
          <TouchableOpacity style={styles.biometricButton} onPress={handleBiometric}>
            <Text style={styles.biometricText}>👆 Biyometrik ile giriş</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  brand: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    height: 48,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  biometricButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  biometricText: { color: '#6b7280', fontSize: 14 },
  error: {
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
});