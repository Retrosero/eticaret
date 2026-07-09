/**
 * Installed Plugins — Version History + Update / Rollback.
 */
import { Card, Heading } from '@eticart/ui';
import { InstalledPluginsClient } from './InstalledPluginsClient';

const API = process.env['COMMERCE_BACKEND_API'] ?? 'http://localhost:3001';

async function fetchInstalled(): Promise<unknown[]> {
  try {
    const r = await fetch(`${API}/marketplace/installed`, {
      headers: { Authorization: `Bearer ${process.env['TENANT_API_TOKEN'] ?? ''}` },
      cache: 'no-store',
    });
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

async function fetchHistory(): Promise<unknown[]> {
  try {
    const r = await fetch(`${API}/marketplace/installed/history`, {
      headers: { Authorization: `Bearer ${process.env['TENANT_API_TOKEN'] ?? ''}` },
      cache: 'no-store',
    });
    if (!r.ok) return [];
    return (await r.json()) as unknown[];
  } catch {
    return [];
  }
}

async function fetchVersions(): Promise<Record<string, unknown[]>> {
  try {
    const r = await fetch(`${API}/marketplace/versions`, {
      headers: { Authorization: `Bearer ${process.env['TENANT_API_TOKEN'] ?? ''}` },
      cache: 'no-store',
    });
    if (!r.ok) return {};
    return (await r.json()) as Record<string, unknown[]>;
  } catch {
    return {};
  }
}

export default async function InstalledPluginsPage() {
  const [installed, history, versions] = await Promise.all([
    fetchInstalled(),
    fetchHistory(),
    fetchVersions(),
  ]);

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Heading level={1}>Yüklü Pluginler & Versiyonlar</Heading>
      <InstalledPluginsClient
        installed={installed as Array<{ code: string; enabled: boolean; config: Record<string, unknown>; version?: string }>}
        history={history as Array<{ pluginCode: string; fromVersion: string | null; toVersion: string; reason: string; timestamp: string; breaking: boolean }>}
        versions={versions}
      />
    </div>
  );
}