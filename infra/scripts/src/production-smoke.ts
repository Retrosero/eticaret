/**
 * Production smoke test.
 *
 * Kullanım:
 *   BACKEND_URL=https://api.eticart.com.tr \
 *   STOREFRONT_URL=https://eticart.com.tr \
 *   TENANT_HOST=firma-a.eticart.com.tr \
 *   pnpm --filter @eticart/infra-scripts smoke
 */

type Check = { name: string; url: string; expected: number | 'not-2xx'; headers?: Record<string, string> };

async function runCheck(check: Check): Promise<void> {
  const response = await fetch(check.url, {
    headers: check.headers,
    signal: AbortSignal.timeout(8_000),
  });
  const ok = check.expected === 'not-2xx'
    ? response.status < 200 || response.status >= 300
    : response.status === check.expected;
  if (!ok) {
    throw new Error(`${check.name}: beklenen ${check.expected}, gelen ${response.status}`);
  }
  console.log(`[smoke] OK ${check.name} (${response.status})`);
}

async function run(): Promise<void> {
  const backend = process.env['BACKEND_URL']?.replace(/\/$/u, '');
  const storefront = process.env['STOREFRONT_URL']?.replace(/\/$/u, '');
  const tenantHost = process.env['TENANT_HOST']?.trim().toLowerCase();
  if (!backend || !storefront || !tenantHost) {
    throw new Error('BACKEND_URL, STOREFRONT_URL ve TENANT_HOST zorunludur.');
  }

  const checks: Check[] = [
    { name: 'commerce health', url: `${backend}/health`, expected: 200 },
    { name: 'commerce ready', url: `${backend}/ready`, expected: 200 },
    { name: 'storefront ready', url: `${storefront}/ready`, expected: 200 },
    { name: 'tenant storefront', url: storefront, expected: 200, headers: { Host: tenantHost } },
    { name: 'unknown tenant blocked', url: storefront, expected: 'not-2xx', headers: { Host: `unknown-${tenantHost}` } },
  ];

  for (const check of checks) await runCheck(check);
  console.log('[smoke] Production smoke test başarılı.');
}

run().catch((error) => {
  console.error(`[smoke] Başarısız: ${(error as Error).message}`);
  process.exitCode = 1;
});
