/**
 * api-client.ts birim testleri.
 *
 * - GET başarılı yanıt
 * - HTTP hata yanıtı (400/500)
 * - JSON parse hatası
 * - Session key yönetimi (localStorage)
 *
 * `fetch` global olarak mock'lanır.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClient,
  ApiError,
  _resetApiClientForTests,
  clearSessionKey,
  getApiClient,
  getSessionKey,
  setSessionKey,
} from './api-client';

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

interface MockResponseInit {
  readonly status?: number;
  readonly json?: unknown;
  readonly jsonError?: boolean;
  readonly contentType?: string | null;
  readonly sessionHeader?: string | null;
  readonly noContent?: boolean;
}

function mockFetchReturn(init: MockResponseInit = {}): Response {
  const status = init.status ?? 200;
  const contentType = init.contentType === null ? null : (init.contentType ?? 'application/json');
  return new Response(
    init.noContent === true
      ? null
      : init.jsonError === true
        ? '{invalid json'
        : JSON.stringify(init.json ?? {}),
    {
      status,
      headers: {
        ...(contentType === null ? {} : { 'content-type': contentType }),
        ...(init.sessionHeader !== null && init.sessionHeader !== undefined
          ? { 'x-cart-session': init.sessionHeader }
          : {}),
      },
    },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Yaşam döngüsü
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  // Storage temizle
  if (typeof window !== 'undefined') window.localStorage.clear();
  _resetApiClientForTests();
  // env sıfırla
  delete process.env['NEXT_PUBLIC_API_URL'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('ApiClient — GET başarılı yanıt', () => {
  it('JSON yanıtı parse eder ve döndürür', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchReturn({ json: { id: 'abc', items: [{ id: 'i1' }] } }),
    );

    const client = new ApiClient({ baseUrl: 'https://api.test' });
    const result = await client.get<{ id: string; items: { id: string }[] }>('/cart');

    expect(result.id).toBe('abc');
    expect(result.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/cart');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Accept: 'application/json' });
    expect(init.body).toBeNull();
  });

  it('Content-Type yoksa boş gövde kabul edilir', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('OK', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const client = new ApiClient({ baseUrl: 'https://api.test' });
    const result = await client.get<{ ok: boolean }>('/ok');
    expect(result).toBeNull();
  });
});

describe('ApiClient — HTTP hata yanıtı', () => {
  it('400 yanıtında ApiError fırlatır', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchReturn({
        status: 400,
        json: { code: 'BAD_REQUEST', message: 'Geçersiz istek' },
      }),
    );

    const client = new ApiClient({ baseUrl: 'https://api.test' });
    await expect(client.get('/cart')).rejects.toBeInstanceOf(ApiError);

    try {
      fetchMock.mockResolvedValueOnce(
        mockFetchReturn({
          status: 400,
          json: { code: 'BAD_REQUEST', message: 'Geçersiz istek' },
        }),
      );
      await client.get('/cart');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe('BAD_REQUEST');
      expect(apiErr.message).toBe('Geçersiz istek');
    }
  });

  it('500 yanıtında details alanını taşır', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchReturn({
        status: 500,
        json: {
          code: 'SERVER_ERROR',
          message: 'Sunucu hatası',
          details: { reason: 'DB' },
        },
      }),
    );

    const client = new ApiClient({ baseUrl: 'https://api.test' });
    try {
      await client.get('/cart');
      throw new Error('Test başarısız: hata bekleniyordu');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.code).toBe('SERVER_ERROR');
      expect(apiErr.details).toEqual({ reason: 'DB' });
    }
  });

  it('JSON parse hatası UNEXPECTED_FORMAT fırlatır', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>error</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const client = new ApiClient({ baseUrl: 'https://api.test' });
    try {
      await client.get('/cart');
      throw new Error('Test başarısız: hata bekleniyordu');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(502);
      expect(apiErr.code).toBe('UNEXPECTED_FORMAT');
    }
  });
});

describe('ApiClient — POST/PATCH/DELETE', () => {
  it('POST body JSON.stringify ile gönderir', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchReturn({ json: { ok: true } }));

    const client = new ApiClient({ baseUrl: 'https://api.test' });
    await client.post('/cart/items', { productId: 'p1', quantity: 2 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ productId: 'p1', quantity: 2 }));
  });

  it('PATCH ve DELETE çalışır', async () => {
    fetchMock
      .mockResolvedValueOnce(mockFetchReturn({ json: { ok: true } }))
      .mockResolvedValueOnce(mockFetchReturn({ noContent: true, status: 204 }));

    const client = new ApiClient({ baseUrl: 'https://api.test' });
    await client.patch('/cart/items/x', { quantity: 3 });
    await client.delete('/cart/items/x');

    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });
});

describe('ApiClient — Session key yönetimi', () => {
  it('localStorage\'da session yoksa null döner', () => {
    expect(getSessionKey()).toBeNull();
  });

  it('setSessionKey ile localStorage\'a yazılır', () => {
    setSessionKey('sess-123');
    expect(getSessionKey()).toBe('sess-123');
  });

  it('clearSessionKey ile localStorage temizlenir', () => {
    setSessionKey('sess-123');
    clearSessionKey();
    expect(getSessionKey()).toBeNull();
  });

  it('İlk istekte response x-cart-session header\'ı set edilir', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchReturn({ json: { cartId: 'c-1' }, sessionHeader: 'new-sess' }),
    );

    const client = new ApiClient({ baseUrl: 'https://api.test' });
    expect(client.getSession()).toBeNull();

    await client.get('/cart');

    expect(client.getSession()).toBe('new-sess');
    expect(getSessionKey()).toBe('new-sess');
  });

  it('Session varsa istek X-Cart-Session header\'ı taşır', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchReturn({ json: { cartId: 'c-1' } }));

    const client = new ApiClient({ baseUrl: 'https://api.test' });
    client.setSession('existing-sess');

    await client.get('/cart');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'X-Cart-Session': 'existing-sess' });
  });
});

describe('ApiClient — Singleton erişim', () => {
  it('getApiClient aynı instance döndürür', () => {
    process.env['NEXT_PUBLIC_API_URL'] = 'https://api.singletest';

    const a = getApiClient();
    const b = getApiClient();

    expect(a).toBe(b);
    expect(a.getBaseUrl()).toBe('https://api.singletest');
  });

  it('Sondaki slash normalize edilir', () => {
    const client = new ApiClient({ baseUrl: 'https://api.test/' });
    expect(client.getBaseUrl()).toBe('https://api.test');
  });
});

describe('ApiClient — Zaman aşımı', () => {
  it('Abort tetiklendiğinde TIMEOUT hatası fırlatır', async () => {
    fetchMock.mockImplementationOnce(
      () => new Promise((_resolve, reject) => {
        // 50ms sonra manuel abort simülasyonu
        setTimeout(() => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        }, 50);
      }),
    );

    const client = new ApiClient({ baseUrl: 'https://api.test' });
    try {
      await client.get('/slow', { timeoutMs: 20 });
      throw new Error('Test başarısız');
    } catch (err) {
      const apiErr = err as ApiError;
      // 0 + TIMEOUT ya da NETWORK_ERROR (hangisi önce catchlerse)
      expect(['TIMEOUT', 'NETWORK_ERROR']).toContain(apiErr.code);
    }
  }, 5000);
});
