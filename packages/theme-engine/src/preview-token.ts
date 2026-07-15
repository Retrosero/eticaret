import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ThemePreviewClaims {
  tenantId: string;
  assignmentId: string;
  exp: number;
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createThemePreviewToken(
  claims: Omit<ThemePreviewClaims, 'exp'> & { expiresInSeconds?: number },
  secret: string,
): string {
  const payload = encode(JSON.stringify({
    tenantId: claims.tenantId,
    assignmentId: claims.assignmentId,
    exp: Math.floor(Date.now() / 1000) + (claims.expiresInSeconds ?? 900),
  }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyThemePreviewToken(token: string, secret: string): ThemePreviewClaims | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ThemePreviewClaims;
    if (!claims.tenantId || !claims.assignmentId || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
