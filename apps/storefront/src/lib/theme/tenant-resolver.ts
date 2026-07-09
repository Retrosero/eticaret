/**
 * Storefront tenant resolver — Host başlığından tenant bağlamı çözümler.
 *
 * Faz 5'te InMemory demo kullanır (1 tenant). Production'da Faz 2
 * control-plane API'sine bağlanacak.
 *
 * Güvenlik: KRİTİK — yalnızca sunucu tarafında doğrulanmış Host başlığı
 * kullanılır. x-tenant-id benzeri istemci başlıklarına ASLA güvenilmez.
 */

import type { StorefrontTenantContext } from '../../lib/theme/loader.js';

/**
 * Demo tenant kayıt defteri. Production'da bu kayıt control-plane API'den
 * (Faz 2'de implemente edilen) gelecek.
 */
const TENANT_DEMO: ReadonlyArray<{
  match: readonly string[];
  ctx: StorefrontTenantContext;
}> = [
  {
    match: ['demo.eticart.local', 'demo.eticart.com', 'localhost:3000', '127.0.0.1:3000'],
    ctx: {
      tenantId: '00000000-0000-0000-0000-000000000001',
      tenantSlug: 'demo',
      primaryDomain: 'demo.eticart.com',
      currency: 'TRY',
      locale: 'tr',
    },
  },
];

export async function resolveStorefrontTenant(host: string): Promise<StorefrontTenantContext | null> {
  const normalized = host.trim().toLowerCase();
  for (const entry of TENANT_DEMO) {
    if (entry.match.includes(normalized)) return entry.ctx;
  }
  // Geliştirme: her host için demo tenant'a düş.
  return TENANT_DEMO[0]?.ctx ?? null;
}