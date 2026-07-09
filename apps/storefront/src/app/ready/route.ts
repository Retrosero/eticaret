/**
 * Readiness kontrolü — storefront.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Faz 2'de: kontrol, commerce-backend ve control-plane çağrıları eklenebilir
  return NextResponse.json({
    status: 'ok',
    service: 'storefront',
    version: process.env['APP_VERSION'] ?? '0.1.0',
    timestamp: new Date().toISOString(),
    checks: {
      // storefront tek başına herhangi bir bağımlılığı kontrol etmez
      upstream: 'skipped',
    },
  });
}
