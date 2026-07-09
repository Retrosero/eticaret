'use client';

import { useState, useTransition } from 'react';
import { Card } from '@eticart/ui';

interface Plugin {
  code: string;
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  logoUrl?: string;
  tags: string[];
  pricing: { monthlyKurus: number; yearlyKurus: number; hasTrial: boolean } | null;
  slots: Array<{ type: string }>;
}

interface InstalledPlugin {
  enabled: boolean;
  config: Record<string, unknown>;
}

interface Props {
  plugins: Plugin[];
  installedMap: Record<string, InstalledPlugin>;
  categoryLabels: Record<string, string>;
  categoryIcons: Record<string, string>;
}

const API_BASE = process.env['NEXT_PUBLIC_COMMERCE_BACKEND_API'] ?? 'http://localhost:3001';

function getToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|.*;\s*)ta_token\s*=\s*([^;]*).*$/) ?? [];
  return match[1] ?? '';
}

export function MarketplaceClient({
  plugins,
  installedMap,
  categoryLabels,
  categoryIcons,
}: Props) {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = plugins.filter((p) => {
    if (filter !== 'all' && p.category !== filter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleInstall(code: string) {
    startTransition(async () => {
      const res = await fetch(`${API_BASE}/api/marketplace/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ code, config: {} }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const err = await res.json();
        alert(err.message ?? 'Yükleme başarısız.');
      }
    });
  }

  async function handleToggle(code: string, currentlyEnabled: boolean) {
    const action = currentlyEnabled ? 'disable' : 'enable';
    startTransition(async () => {
      const res = await fetch(`${API_BASE}/api/marketplace/installed/${code}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        window.location.reload();
      }
    });
  }

  async function handleUninstall(code: string) {
    if (!confirm(`${code} plugin'ini kaldırmak istediğinizden emin misiniz?`)) return;
    startTransition(async () => {
      const res = await fetch(`${API_BASE}/api/marketplace/installed/${code}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        window.location.reload();
      }
    });
  }

  const categories = ['all', ...Array.from(new Set(plugins.map((p) => p.category)))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Filters */}
      <Card padding="md" elevation="sm">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Plugin ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              minWidth: 200,
              fontSize: '0.9375rem',
            }}
          />
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: filter === cat ? '#111827' : '#f3f4f6',
                  color: filter === cat ? '#fff' : '#374151',
                  border: 0,
                  borderRadius: 6,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  fontWeight: filter === cat ? 500 : 400,
                }}
              >
                {cat === 'all' ? 'Tümü' : categoryLabels[cat] ?? cat}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Plugin Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '1rem',
        }}
      >
        {filtered.map((plugin) => {
          const installed = installedMap[plugin.code];
          return (
            <Card key={plugin.code} padding="lg" elevation="sm">
              <div style={{ display: 'flex', alignItems: 'start', gap: '0.75rem' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: '#f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.75rem',
                    flexShrink: 0,
                  }}
                >
                  {categoryIcons[plugin.category] ?? '🔌'}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{plugin.name}</h3>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                    {categoryLabels[plugin.category] ?? plugin.category} · v{plugin.version}
                  </p>
                </div>
                {installed && (
                  <span
                    style={{
                      padding: '0.125rem 0.5rem',
                      background: installed.enabled ? '#d1fae5' : '#f3f4f6',
                      color: installed.enabled ? '#065f46' : '#6b7280',
                      borderRadius: 4,
                      fontSize: '0.75rem',
                      fontWeight: 500,
                    }}
                  >
                    {installed.enabled ? 'Aktif' : 'Pasif'}
                  </span>
                )}
              </div>

              <p
                style={{
                  marginTop: '0.75rem',
                  color: '#374151',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                }}
              >
                {plugin.description}
              </p>

              {plugin.tags && plugin.tags.length > 0 && (
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {plugin.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        padding: '0.125rem 0.5rem',
                        background: '#f3f4f6',
                        color: '#6b7280',
                        borderRadius: 4,
                        fontSize: '0.75rem',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {plugin.pricing && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #f3f4f6',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.25rem',
                  }}
                >
                  <strong style={{ fontSize: '1.125rem' }}>
                    ₺{(plugin.pricing.monthlyKurus / 100).toFixed(2)}
                  </strong>
                  <span style={{ color: '#6b7280', fontSize: '0.8125rem' }}>/ ay</span>
                  {plugin.pricing.hasTrial && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        padding: '0.125rem 0.5rem',
                        background: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: 4,
                        fontSize: '0.75rem',
                      }}
                    >
                      14 gün ücretsiz
                    </span>
                  )}
                </div>
              )}

              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                {!installed ? (
                  <button
                    onClick={() => handleInstall(plugin.code)}
                    disabled={isPending}
                    style={{
                      flex: 1,
                      padding: '0.5rem 1rem',
                      background: '#111827',
                      color: '#fff',
                      border: 0,
                      borderRadius: 6,
                      fontWeight: 500,
                      cursor: isPending ? 'wait' : 'pointer',
                      opacity: isPending ? 0.6 : 1,
                    }}
                  >
                    {isPending ? 'Yükleniyor...' : 'Yükle'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleToggle(plugin.code, installed.enabled)}
                      disabled={isPending}
                      style={{
                        flex: 1,
                        padding: '0.5rem 1rem',
                        background: installed.enabled ? '#f3f4f6' : '#10b981',
                        color: installed.enabled ? '#111827' : '#fff',
                        border: 0,
                        borderRadius: 6,
                        fontWeight: 500,
                        cursor: isPending ? 'wait' : 'pointer',
                      }}
                    >
                      {installed.enabled ? 'Devre Dışı Bırak' : 'Etkinleştir'}
                    </button>
                    <button
                      onClick={() => handleUninstall(plugin.code)}
                      disabled={isPending}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: '#fee2e2',
                        color: '#991b1b',
                        border: 0,
                        borderRadius: 6,
                        fontWeight: 500,
                        cursor: isPending ? 'wait' : 'pointer',
                      }}
                    >
                      🗑
                    </button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
