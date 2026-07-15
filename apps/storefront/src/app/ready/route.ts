/**
 * Readiness kontrolü — storefront.
 */

import { NextResponse } from 'next/server';
import { queryControlRows } from '../../lib/server/control-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: { controlDb: 'ok' | 'error'; commerceBackend: 'ok' | 'error' } = {
    controlDb: 'error',
    commerceBackend: 'error',
  };

  try {
    await queryControlRows('SELECT 1 AS ready');
    checks.controlDb = 'ok';
  } catch {
    checks.controlDb = 'error';
  }

  const backendUrl = process.env['NEXT_PUBLIC_STORE_API'];
  if (backendUrl) {
    try {
      const response = await fetch(`${backendUrl}/health`, {
        signal: AbortSignal.timeout(2_000),
        cache: 'no-store',
      });
      checks.commerceBackend = response.ok ? 'ok' : 'error';
    } catch {
      checks.commerceBackend = 'error';
    }
  }

  const ready = Object.values(checks).every((value) => value === 'ok');
  return NextResponse.json({
    status: ready ? 'ok' : 'degraded',
    service: 'storefront',
    version: process.env['APP_VERSION'] ?? '0.1.0',
    timestamp: new Date().toISOString(),
    checks,
  }, { status: ready ? 200 : 503 });
}
