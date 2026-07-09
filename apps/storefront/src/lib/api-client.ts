/**
 * Storefront API istemcisi — fetch wrapper.
 *
 * - `NEXT_PUBLIC_API_URL` env'inden base URL alır
 * - Anonim sepet için `sessionKey` localStorage'da saklanır (`eticart_session`)
 * - Bearer token YOK — anonim vitrin trafiği
 * - JSON request/response standardı
 * - Tüm beklenen HTTP hataları `ApiError` tipine dönüştürülür
 *
 * NOT: Sunucu tarafında kullanılırsa (örn. Next.js Route Handler) `localStorage`
 * erişilemez. Bu yüzden `getSessionKey`/`setSessionKey` çağrıları try/catch
 * ile sarılmıştır; SSR'da sessizce yok sayılır.
 */

const SESSION_KEY_STORAGE = 'eticart_session' as const;
const DEFAULT_TIMEOUT_MS = 30_000 as const;

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

/** API'den beklenen hata formatı. */
export interface ApiErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Ham HTTP hatası. */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(status: number, code: string, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** İstek seçenekleri. */
export interface ApiRequestOptions {
  /** Ek header (örn. tenant). */
  readonly headers?: Readonly<Record<string, string>>;
  /** İstek zaman aşımı (ms). */
  readonly timeoutMs?: number;
  /** İstek iptal sinyali. */
  readonly signal?: AbortSignal;
}

/** İç kullanım: gövde tipi. */
type RequestBody = Record<string, unknown> | readonly unknown[] | string | number | boolean | null;

// ---------------------------------------------------------------------------
// Storage yardımcıları (localStorage erişimi)
// ---------------------------------------------------------------------------

/**
 * localStorage'dan session key okur.
 *
 * Sunucu tarafında `localStorage` undefined döner; bu fonksiyon onu güvenli
 * şekilde handle eder ve SSR'da `null` döndürür.
 */
export function getSessionKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SESSION_KEY_STORAGE);
  } catch {
    return null;
  }
}

/**
 * localStorage'a session key yazar.
 *
 * SSR'da no-op. Hata durumunda sessizce yutar (private mode, kotası dolu vb.).
 */
export function setSessionKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_KEY_STORAGE, key);
  } catch {
    // storage quota veya private mode — özelliği devre dışı bırak
  }
}

/**
 * localStorage'dan session key temizler.
 */
export function clearSessionKey(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_KEY_STORAGE);
  } catch {
    // storage temizlenemese de sessizce geç
  }
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

/**
 * HTTP API istemcisi. `ApiClient.instance` üzerinden singleton olarak kullanılır;
 * `new ApiClient({...})` ile özel base URL ile de oluşturulabilir.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private sessionKey: string | null;

  constructor(opts: { baseUrl?: string } = {}) {
    const env = process.env['NEXT_PUBLIC_API_URL'] ?? '';
    // Sondaki slash'i normalize et
    this.baseUrl = (opts.baseUrl ?? env).replace(/\/+$/u, '');
    this.sessionKey = getSessionKey();
  }

  /** Base URL'i döndürür (test amaçlı public). */
  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Mevcut session key. */
  public getSession(): string | null {
    return this.sessionKey;
  }

  /** Session key'i manuel set et (örn. cart-store'dan senkronizasyon). */
  public setSession(key: string): void {
    this.sessionKey = key;
    setSessionKey(key);
  }

  /** Session temizle. */
  public resetSession(): void {
    this.sessionKey = null;
    clearSessionKey();
  }

  // ---------------------------------------------------------------------
  // HTTP metotları
  // ---------------------------------------------------------------------

  public async get<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, opts);
  }

  public async post<T>(path: string, body?: RequestBody, opts: ApiRequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, body, opts);
  }

  public async patch<T>(path: string, body?: RequestBody, opts: ApiRequestOptions = {}): Promise<T> {
    return this.request<T>('PATCH', path, body, opts);
  }

  public async delete<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', path, undefined, opts);
  }

  // ---------------------------------------------------------------------
  // İç istek mantığı
  // ---------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body: RequestBody | undefined,
    opts: ApiRequestOptions,
  ): Promise<T> {
    const url = this.buildUrl(path);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(opts.headers ?? {}),
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.sessionKey !== null) {
      headers['X-Cart-Session'] = this.sessionKey;
    }

    // Timeout yönetimi — kullanıcı sinyali varsa birleştir
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    if (opts.signal !== undefined) {
      // Kullanıcı signal'i ile zaman aşımını birleştir
      const userSignal = opts.signal;
      if (userSignal.aborted) {
        clearTimeout(timer);
      } else {
        userSignal.addEventListener('abort', () => {
          controller.abort();
        });
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : null,
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(0, 'TIMEOUT', 'İstek zaman aşımına uğradı');
      }
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        err instanceof Error ? err.message : 'Ağ hatası',
      );
    }

    clearTimeout(timer);

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    // Session header'ı response'dan güncelle
    const returnedKey = response.headers.get('x-cart-session');
    if (returnedKey !== null && returnedKey.length > 0 && returnedKey !== this.sessionKey) {
      this.setSession(returnedKey);
    }

    // JSON parse
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json') === false && response.ok === false) {
      throw new ApiError(
        response.status,
        'UNEXPECTED_FORMAT',
        `Beklenmeyen yanıt tipi: ${contentType || 'yok'}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      // JSON parse başarısız → boş gövde kabul et
      parsed = null;
    }

    // 2xx dışı durumlar hata
    if (!response.ok) {
      const errBody = (parsed ?? {}) as Partial<ApiErrorPayload>;
      throw new ApiError(
        response.status,
        errBody.code ?? 'UNKNOWN_ERROR',
        errBody.message ?? `HTTP ${response.status}`,
        errBody.details,
      );
    }

    // Tip dönüşümü — implementasyona bırakıldı
    return parsed as T;
  }

  private buildUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }
}

// ---------------------------------------------------------------------------
// Singleton erişim (uygulama genelinde tek örnek)
// ---------------------------------------------------------------------------

let instance: ApiClient | null = null;

/**
 * Singleton API istemcisi. `baseUrl` opsiyonel olarak verilmezse
 * `NEXT_PUBLIC_API_URL` env'inden okur.
 */
export function getApiClient(opts: { baseUrl?: string } = {}): ApiClient {
  if (instance === null) {
    instance = new ApiClient(opts);
  }
  return instance;
}

/** Test amaçlı: singleton'ı sıfırlar. */
export function _resetApiClientForTests(): void {
  instance = null;
}
