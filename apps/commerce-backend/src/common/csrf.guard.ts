/**
 * CSRF koruması — Double-Submit Cookie pattern.
 *
 * Akış:
 *   1. Sunucu `_csrf` cookie'si (httpOnly=false, sameSite=Lax) set eder
 *   2. Frontend bu token'ı okur ve state-changing isteklerde `X-CSRF-Token` header'ında gönderir
 *   3. Sunucu cookie + header eşleşmesini kontrol eder; uyuşmazsa 403
 *
 * Avantajları:
 *   - Stateless (sunucuda token saklamaz)
 *   - Same-origin policy cookie'ye erişimi engeller
 *   - Cookie httpOnly=false çünkü frontend'in okuması gerekiyor
 *     (sadece token, gerçek session cookie httpOnly=true kalır)
 *
 * NOT: Bu guard sadece "unsafe" HTTP method'lar için aktiftir (POST, PUT, PATCH, DELETE).
 *      GET, HEAD, OPTIONS her zaman serbesttir.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ApiError, ErrorCode } from '@eticart/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

/** Basit cookie parser — cookie-parser bağımlılığı olmadan. */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const name = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const COOKIE_NAME = '_csrf';
const HEADER_NAME = 'x-csrf-token';
const CSRF_TTL_SECONDS = 24 * 60 * 60; // 24 saat

/** CSRF token üretimi (HMAC-signed). */
function generateToken(secret: string): string {
  const nonce = randomBytes(16).toString('hex');
  const sig = createHmac('sha256', secret).update(nonce).digest('hex');
  return `${nonce}.${sig}`;
}

/** Token doğrulama. */
function verifyToken(token: string, secret: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const dotIdx = token.indexOf('.');
  if (dotIdx === -1) return false;

  const nonce = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!nonce || !sig) return false;

  const expected = createHmac('sha256', secret).update(nonce).digest('hex');

  // Timing-safe karşılaştırma (sabit süre)
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export interface CsrfGuardOptions {
  /** Cookie'de token yoksa otomatik set et (GET isteklerinde). */
  autoSetCookie?: boolean;
  /** Public endpoint'ler — CSRF kontrolü yapılmaz. */
  publicPaths?: ReadonlyArray<string | RegExp>;
  /** HMAC signing secret. JWT_SECRET kullanılır. */
  secret: string;
  /** Cookie domain (prod). */
  cookieDomain?: string;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly opts: Required<Pick<CsrfGuardOptions, 'autoSetCookie' | 'publicPaths' | 'secret' | 'cookieDomain'>>;

  constructor(opts: CsrfGuardOptions) {
    this.opts = {
      autoSetCookie: opts.autoSetCookie ?? true,
      publicPaths: opts.publicPaths ?? [],
      secret: opts.secret,
      cookieDomain: opts.cookieDomain ?? '',
    };
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    // express cookie-parser yoksa fallback parser kullan
    const cookies = (req as any).cookies ?? parseCookies(req.headers.cookie);
    (req as any).cookies = cookies;

    const path = req.path;

    // Public path'ler her zaman serbest
    if (this.opts.publicPaths.some((p) => typeof p === 'string' ? path.startsWith(p) : p.test(path))) {
      return true;
    }

    // GET/HEAD/OPTIONS — cookie yoksa set et, kontrol yapma
    if (!UNSAFE_METHODS.has(req.method)) {
      if (this.opts.autoSetCookie && !req.cookies?.[COOKIE_NAME]) {
        this.setCookie(res);
      }
      return true;
    }

    // Unsafe method — token kontrolü
    const cookieToken = req.cookies?.[COOKIE_NAME];
    const headerToken = (req.headers[HEADER_NAME] as string | undefined) ?? '';

    if (!cookieToken || !headerToken) {
      throw new ApiError(403, ErrorCode.FORBIDDEN, 'CSRF token eksik.');
    }

    if (cookieToken !== headerToken) {
      throw new ApiError(403, ErrorCode.FORBIDDEN, 'CSRF token uyuşmazlığı.');
    }

    if (!verifyToken(cookieToken, this.opts.secret)) {
      throw new ApiError(403, ErrorCode.FORBIDDEN, 'CSRF token imzası geçersiz.');
    }

    return true;
  }

  private setCookie(res: Response): void {
    const token = generateToken(this.opts.secret);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: false, // frontend okuyabilsin
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: CSRF_TTL_SECONDS * 1000,
      path: '/',
      ...(this.opts.cookieDomain ? { domain: this.opts.cookieDomain } : {}),
    });
  }
}