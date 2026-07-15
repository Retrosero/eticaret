import { describe, expect, it, vi } from 'vitest';

const queryControlRows = vi.fn();
vi.mock('../../lib/server/control-db', () => ({ queryControlRows }));

describe('storefront readiness', () => {
  it('control DB ve backend hazırsa 200 döner', async () => {
    queryControlRows.mockResolvedValue([{ ready: 1 }]);
    vi.stubEnv('NEXT_PUBLIC_STORE_API', 'http://commerce-backend');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks).toEqual({ controlDb: 'ok', commerceBackend: 'ok' });
  });

  it('bağımlılık başarısızsa 503 döner', async () => {
    queryControlRows.mockRejectedValue(new Error('db down'));
    vi.stubEnv('NEXT_PUBLIC_STORE_API', 'http://commerce-backend');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('backend down')));

    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('degraded');
  });
});
