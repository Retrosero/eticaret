/**
 * CSRF guard testleri — double-submit cookie pattern.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CsrfGuard } from '../csrf.guard.js';

interface MockReq {
  method: string;
  path: string;
  headers: Record<string, string>;
  cookies?: Record<string, string>;
}

interface MockRes {
  cookie: ReturnType<typeof vi.fn>;
}

const SECRET = 'test-csrf-secret-32-chars-long-yes';

function makeGuard(publicPaths?: ReadonlyArray<string | RegExp>): CsrfGuard {
  return new CsrfGuard({
    secret: SECRET,
    publicPaths,
    autoSetCookie: true,
  });
}

function makeReq(method: string, path: string, opts?: {
  cookie?: string;
  csrfHeader?: string;
}): MockReq {
  const req: MockReq = {
    method,
    path,
    headers: {},
  };
  if (opts?.cookie) req.headers['cookie'] = opts.cookie;
  if (opts?.csrfHeader) req.headers['x-csrf-token'] = opts.csrfHeader;
  return req;
}

function makeRes(): MockRes {
  return {
    cookie: vi.fn(),
  };
}

function makeCtx(req: any, res: any = makeRes()): any {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  };
}

describe('CsrfGuard', () => {
  let guard: CsrfGuard;
  let res: MockRes;

  beforeEach(() => {
    guard = makeGuard(['/api/auth/login']);
    res = makeRes();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET istekleri', () => {
    it('GET → her zaman serbest, cookie set edilir', () => {
      const req = makeReq('GET', '/api/store/products');
      expect(() => guard.canActivate(makeCtx(req, res))).not.toThrow();
      // Cookie yoksa set edilmeli
      expect(res.cookie).toHaveBeenCalled();
    });

    it('GET → cookie zaten varsa set edilmez', () => {
      const req = makeReq('GET', '/api/store/products');
      req.cookies = { _csrf: 'existing.token' };
      guard.canActivate(makeCtx(req, res));
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('Public path GET → serbest', () => {
      const req = makeReq('GET', '/api/auth/login');
      expect(() => guard.canActivate(makeCtx(req, res))).not.toThrow();
    });
  });

  describe('POST/PUT/PATCH/DELETE istekleri', () => {
    it('POST → token yoksa 403', () => {
      const req = makeReq('POST', '/api/admin/products');
      expect(() => guard.canActivate(makeCtx(req, res))).toThrow(/CSRF token eksik/);
    });

    it('POST → sadece header varsa 403', () => {
      const req = makeReq('POST', '/api/admin/products', {
        csrfHeader: 'some.token',
      });
      // Cookie yok
      expect(() => guard.canActivate(makeCtx(req, res))).toThrow(/CSRF token eksik/);
    });

    it('POST → sadece cookie varsa 403', () => {
      const req = makeReq('POST', '/api/admin/products', {
        cookie: '_csrf=some.token',
      });
      expect(() => guard.canActivate(makeCtx(req, res))).toThrow(/CSRF token eksik/);
    });

    it('POST → cookie + header uyuşmazsa 403', () => {
      const req = makeReq('POST', '/api/admin/products', {
        cookie: '_csrf=token-a',
        csrfHeader: 'token-b',
      });
      expect(() => guard.canActivate(makeCtx(req, res))).toThrow(/CSRF token uyuşmazlığı/);
    });

    it('POST → HMAC imzası geçersiz 403', () => {
      // Token format yanlış (nonce.sig)
      const badToken = 'abcd1234.invalidsig';
      const req = makeReq('POST', '/api/admin/products', {
        cookie: `_csrf=${badToken}`,
        csrfHeader: badToken,
      });
      expect(() => guard.canActivate(makeCtx(req, res))).toThrow(/CSRF token imzası geçersiz/);
    });

    it('POST → geçerli HMAC token kabul', () => {
      // Önce GET ile geçerli token al
      const getReq = makeReq('GET', '/api/store/products');
      guard.canActivate(makeCtx(getReq, res));
      const setCookieCall = res.cookie.mock.calls[0];
      const token = setCookieCall[1];

      // POST'ta aynı token'ı kullan
      const postReq = makeReq('POST', '/api/admin/products', {
        cookie: `_csrf=${token}`,
        csrfHeader: token,
      });
      // Geçerli token → hata fırlamamalı
      expect(() => guard.canActivate(makeCtx(postReq, res))).not.toThrow();
    });

    it('PUT → token kontrolü uygulanır', () => {
      const req = makeReq('PUT', '/api/admin/products/123', {
        cookie: '_csrf=valid.token',
        csrfHeader: 'different.token',
      });
      expect(() => guard.canActivate(makeCtx(req, res))).toThrow(/CSRF token uyuşmazlığı/);
    });

    it('DELETE → token kontrolü uygulanır', () => {
      const req = makeReq('DELETE', '/api/admin/products/123');
      expect(() => guard.canActivate(makeCtx(req, res))).toThrow(/CSRF token eksik/);
    });

    it('Public path POST → CSRF muaf', () => {
      const req = makeReq('POST', '/api/auth/login');
      expect(() => guard.canActivate(makeCtx(req, res))).not.toThrow();
    });
  });

  describe('Token formatı', () => {
    it('Geçerli token nonce.signature formatında', () => {
      const req = makeReq('GET', '/api/store/products');
      guard.canActivate(makeCtx(req, res));
      const token = res.cookie.mock.calls[0][1];
      expect(token).toMatch(/^[0-9a-f]+\.[0-9a-f]+$/);
    });

    it('Token en az 32 karakter (nonce 32 hex + sig 64 hex)', () => {
      const req = makeReq('GET', '/api/store/products');
      guard.canActivate(makeCtx(req, res));
      const token = res.cookie.mock.calls[0][1];
      expect(token.length).toBeGreaterThan(32);
    });

    it('Her çağrıda farklı token (nonce random)', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const req = makeReq('GET', '/api/store/products');
        const r = makeRes();
        guard.canActivate(makeCtx(req, r));
        tokens.add(r.cookie.mock.calls[0][1]);
      }
      expect(tokens.size).toBe(10);
    });
  });

  describe('Cookie parser fallback', () => {
    it('Cookie-parser olmadan cookie header parse edilir', () => {
      const req = makeReq('POST', '/api/admin/products', {
        cookie: '_csrf=abc.def; session=sess123; theme=dark',
      });
      req.headers['x-csrf-token'] = 'abc.def';

      // Cookie set edilmemiş ama header var — 403
      expect(() => guard.canActivate(makeCtx(req, res))).toThrow(/CSRF token imzası geçersiz/);

      // req.cookies parse edilmiş olmalı
      expect(req.cookies).toEqual({
        _csrf: 'abc.def',
        session: 'sess123',
        theme: 'dark',
      });
    });
  });
});