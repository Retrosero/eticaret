import argon2 from 'argon2';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export interface LocalAccessTokenPayload extends JWTPayload {
  sub: string;
  role: string;
  tenantId: string | null;
  identity: 'tenant';
  sessionId: string;
  twoFactorVerified: boolean;
}

const DEFAULT_ISSUER = 'eticart';

function getJwtSecret(): Uint8Array {
  const secret = process.env['JWT_SECRET'] ?? 'local-dev-jwt-secret-change-me-32chars';
  return new TextEncoder().encode(secret);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function signTenantAccessToken(payload: Omit<LocalAccessTokenPayload, 'iat' | 'exp' | 'iss'>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(DEFAULT_ISSUER)
    .setAudience(DEFAULT_ISSUER)
    .setExpirationTime('8h')
    .setSubject(String(payload.sub))
    .sign(getJwtSecret());
}

export async function verifyTenantAccessToken(token: string): Promise<LocalAccessTokenPayload | null> {
  try {
    const result = await jwtVerify(token, getJwtSecret(), {
      issuer: DEFAULT_ISSUER,
      audience: DEFAULT_ISSUER,
    });
    return result.payload as LocalAccessTokenPayload;
  } catch {
    return null;
  }
}
