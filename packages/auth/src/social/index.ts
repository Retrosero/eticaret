/**
 * Sosyal giriş (OAuth2 / OIDC) altyapısı.
 *
 * Faz 3'te yalnızca Google ve Facebook için stub.
 * İleride (Faz 8+) gerçek client_id / client_secret entegrasyonu yapılacak.
 *
 * @module social
 */

import { z } from 'zod';

/** Google OAuth2 user info yanıtı için minimum şema. */
export const googleUserInfoSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
});
export type GoogleUserInfo = z.infer<typeof googleUserInfoSchema>;

/** Facebook OAuth2 user info yanıtı için minimum şema. */
export const facebookUserInfoSchema = z.object({
  id: z.string(),
  email: z.string().email().optional(),
  name: z.string().optional(),
});
export type FacebookUserInfo = z.infer<typeof facebookUserInfoSchema>;

export type SocialProvider = 'google' | 'facebook';

/**
 * OAuth2 authorization URL üretir (Faz 8+'da doldurulacak).
 *
 * @example
 *   buildAuthorizationUrl('google', {
 *     clientId: env.GOOGLE_CLIENT_ID,
 *     redirectUri: 'https://storefront.com/api/auth/social/google/callback',
 *     state: randomState,
 *     scopes: ['openid', 'email', 'profile'],
 *   });
 */
export function buildAuthorizationUrl(
  provider: SocialProvider,
  params: {
    clientId: string;
    redirectUri: string;
    state: string;
    scopes: ReadonlyArray<string>;
  },
): string {
  const base =
    provider === 'google'
      ? 'https://accounts.google.com/o/oauth2/v2/auth'
      : 'https://www.facebook.com/v18.0/dialog/oauth';
  const url = new URL(base);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  return url.toString();
}

/**
 * Provider tarafından callback'te dönen `code` ile access token alır.
 * Faz 3'te stub; Faz 8+'da HTTP çağrısı eklenecek.
 */
export async function exchangeCodeForToken(
  provider: SocialProvider,
  _params: { clientId: string; clientSecret: string; code: string; redirectUri: string },
): Promise<{ accessToken: string; idToken?: string }> {
  // Stub: Faz 8+'da fetch ile gerçek OAuth server'a istek atılacak.
  void provider;
  throw new Error('Sosyal giriş şu anda devre dışı (Faz 8+).');
}

/**
 * Provider'dan user info çeker.
 * Faz 3'te stub; Faz 8+'da fetch ile gerçek API çağrısı yapılacak.
 */
export async function fetchSocialUserInfo(
  provider: SocialProvider,
  _accessToken: string,
): Promise<GoogleUserInfo | FacebookUserInfo> {
  void provider;
  throw new Error('Sosyal giriş şu anda devre dışı (Faz 8+).');
}