'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env['NEXT_PUBLIC_COMMERCE_BACKEND_API'] ?? 'http://localhost:3001';

interface InstalledPlugin {
  code: string;
  enabled: boolean;
  config: Record<string, unknown>;
  version?: string;
}

interface HistoryEntry {
  pluginCode: string;
  fromVersion: string | null;
  toVersion: string;
  reason: string;
  timestamp: string;
  breaking: boolean;
}

interface Version {
  version: string;
  breaking?: boolean;
  description?: string;
}

function getToken(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|.*;\s*)ta_token\s*=\s*([^;]*).*$/) ?? [];
  return m[1] ?? '';
}

const REASON_LABELS: Record<string, { text: string; color: string; bg: string }> = {
  install: { text: 'İlk Kurulum', color: '#065f46', bg: '#d1fae5' },
  update: { text: 'Güncelleme', color: '#1e40af', bg: '#dbeafe' },
  rollback: { text: 'Geri Alma', color: '#92400e', bg: '#fef3c7' },
  reinstall: { text: 'Yeniden Kurulum', color: '#6b7280', bg: '#f3f4f6' },
};

export function InstalledPluginsClient({
  installed,
  history,
  versions,
}: {
  installed: InstalledPlugin[];
  history: HistoryEntry[];
  versions: Record<string, Version[]>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function updatePlugin(code: string, version: string) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch(`${API}/marketplace/installed/${code}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.message ?? 'Güncelleme başarısız.');
        return;
      }
      const result = await res.json();
      if (result.breaking) {
        setInfo(`⚠️ Breaking change! Önceki: ${result.previousVersion} → ${result.newVersion}. Rollback önerilir.`);
      } else {
        setInfo(`Güncellendi: ${result.previousVersion} → ${result.newVersion}`);
      }
      router.refresh();
    });
  }

  function rollbackPlugin(code: string, version: string) {
    if (!confirm(`${version} versiyonuna rollback yapılacak. Emin misiniz?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`${API}/marketplace/installed/${code}/rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.message ?? 'Rollback başarısız.');
        return;
      }
      setInfo('Rollback tamamlandı.');
      router.refresh();
    });
  }

  async function checkHealth(code: string) {
    setError(null);
    const res = await fetch(`${API}/marketplace/installed/${code}/health`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const err = await res.json();
      setError(err.message ?? 'Health check başarısız.');
      return;
    }
    const result = await res.json();
    setInfo(`Health: ${result.status} (${new Date(result.lastChecked).toLocaleString('tr-TR')})`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Yüklü Pluginler */}
      <section>
        <h2 style={{ margin: '0 0 1rem' }}>Yüklü Pluginler</h2>
        {installed.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Henüz plugin yüklü değil.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {installed.map((p) => {
              const pluginVersions = versions[p.code] ?? [];
              const latest = (pluginVersions[0] as Version | undefined)?.version;
              const updateAvailable = latest && latest !== p.version;
              return (
                <div
                  key={p.code}
                  style={{
                    padding: '1rem 1.25rem',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: '0.9375rem' }}>{p.code}</strong>
                    <span style={{ marginLeft: '0.5rem', color: '#6b7280', fontSize: '0.8125rem' }}>
                      v{p.version ?? '1.0.0'}
                    </span>
                    {updateAvailable && (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          padding: '0.125rem 0.5rem',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                        }}
                      >
                        Güncelleme var: v{latest}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {updateAvailable && (
                      <button
                        onClick={() => updatePlugin(p.code, latest!)}
                        disabled={isPending}
                        style={buttonStyle('#3b82f6')}
                      >
                        Güncelle
                      </button>
                    )}
                    <button
                      onClick={() => checkHealth(p.code)}
                      disabled={isPending}
                      style={buttonStyle('#6b7280')}
                    >
                      Sağlık
                    </button>
                    {history.some(
                      (h) => h.pluginCode === p.code && h.fromVersion !== h.toVersion,
                    ) && (
                      <button
                        onClick={() => {
                          const prev = history.find(
                            (h) => h.pluginCode === p.code && h.fromVersion !== h.toVersion,
                          );
                          if (prev?.fromVersion) rollbackPlugin(p.code, prev.fromVersion);
                        }}
                        disabled={isPending}
                        style={buttonStyle('#ef4444')}
                      >
                        Rollback
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Update History */}
      <section>
        <h2 style={{ margin: '0 0 1rem' }}>Güncelleme Geçmişi</h2>
        {history.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Henüz güncelleme yapılmadı.</p>
        ) : (
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {history.slice(0, 20).map((h, i) => {
              const label = REASON_LABELS[h.reason] ?? REASON_LABELS['reinstall']!;
              return (
                <div
                  key={i}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderBottom: i < history.length - 1 ? '1px solid #e5e7eb' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <span
                    style={{
                      padding: '0.125rem 0.5rem',
                      background: label.bg,
                      color: label.color,
                      borderRadius: 4,
                      fontSize: '0.75rem',
                      fontWeight: 500,
                    }}
                  >
                    {label.text}
                  </span>
                  <strong style={{ fontSize: '0.875rem' }}>{h.pluginCode}</strong>
                  <span style={{ color: '#6b7280', fontSize: '0.8125rem' }}>
                    {h.fromVersion ?? '—'} → {h.toVersion}
                  </span>
                  {h.breaking && (
                    <span
                      style={{
                        padding: '0.125rem 0.5rem',
                        background: '#fee2e2',
                        color: '#991b1b',
                        borderRadius: 4,
                        fontSize: '0.75rem',
                      }}
                    >
                      ⚠️ Breaking
                    </span>
                  )}
                  <time
                    style={{
                      marginLeft: 'auto',
                      color: '#9ca3af',
                      fontSize: '0.75rem',
                    }}
                  >
                    {new Date(h.timestamp).toLocaleString('tr-TR')}
                  </time>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {info && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#dbeafe',
            color: '#1e40af',
            borderRadius: 6,
            fontSize: '0.875rem',
          }}
        >
          {info}
        </div>
      )}
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 6,
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function buttonStyle(color: string): React.CSSProperties {
  return {
    padding: '0.375rem 0.75rem',
    background: color,
    color: '#fff',
    border: 0,
    borderRadius: 6,
    fontSize: '0.8125rem',
    cursor: 'pointer',
    fontWeight: 500,
  };
}