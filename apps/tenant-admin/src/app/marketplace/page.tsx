/**
 * Tenant Admin — Plugin Marketplace.
 */
import { Card, Heading } from '@eticart/ui';
import { MarketplaceClient } from './MarketplaceClient';

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

async function fetchMarketplace(): Promise<Plugin[]> {
  try {
    const res = await fetch(
      `${process.env['COMMERCE_BACKEND_API'] ?? 'http://localhost:3001'}/api/marketplace/plugins`,
      {
        headers: { Authorization: `Bearer ${process.env['TENANT_API_TOKEN'] ?? ''}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as Plugin[];
  } catch {
    return [];
  }
}

async function fetchInstalled(): Promise<
  Array<{ code: string; enabled: boolean; config: Record<string, unknown> }>
> {
  try {
    const res = await fetch(
      `${process.env['COMMERCE_BACKEND_API'] ?? 'http://localhost:3001'}/api/marketplace/installed`,
      {
        headers: { Authorization: `Bearer ${process.env['TENANT_API_TOKEN'] ?? ''}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as Array<{
      code: string;
      enabled: boolean;
      config: Record<string, unknown>;
    }>;
  } catch {
    return [];
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  marketplace: 'Pazaryeri',
  payment: 'Ödeme',
  shipping: 'Kargo',
  integration: 'Entegrasyon',
  analytics: 'Analitik',
  marketing: 'Pazarlama',
  utility: 'Araç',
};

const CATEGORY_ICONS: Record<string, string> = {
  marketplace: '🛒',
  payment: '💳',
  shipping: '🚚',
  integration: '🔌',
  analytics: '📊',
  marketing: '📣',
  utility: '🔧',
};

export default async function MarketplacePage() {
  const [plugins, installed] = await Promise.all([
    fetchMarketplace(),
    fetchInstalled(),
  ]);

  const installedMap = new Map(installed.map((i) => [i.code, i]));

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <Heading level={1}>Plugin Marketplace</Heading>
        <p style={{ color: '#6b7280' }}>
          Mağazanızı pazaryerleri, ödeme sistemleri ve diğer entegrasyonlarla genişletin.
        </p>
      </div>

      {plugins.length === 0 ? (
        <Card padding="lg">
          <p style={{ color: '#6b7280', textAlign: 'center' }}>
            Marketplace'te henüz plugin yok.
          </p>
        </Card>
      ) : (
        <MarketplaceClient
          plugins={plugins}
          installedMap={Object.fromEntries(installedMap)}
          categoryLabels={CATEGORY_LABELS}
          categoryIcons={CATEGORY_ICONS}
        />
      )}
    </div>
  );
}
