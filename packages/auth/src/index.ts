/**
 * @eticart/auth — kimlik doğrulama, JWT, RBAC, 2FA paketi.
 *
 * Faz 3'te tüm uygulamaların ortak kullandığı auth yardımcıları burada toplanır.
 *
 * Alt modüller:
 *  - jwt       : access/refresh token imzalama ve doğrulama (jose)
 *  - password  : argon2id hash, şifre politikası, token üretimi
 *  - tokens    : refresh token rotation, token reuse detection
 *  - two-factor: TOTP (RFC 6238) + backup kodları
 *  - permissions: RBAC izin katalogu ve yardımcıları
 *  - social    : OAuth2 / sosyal giriş altyapısı (stub)
 *
 * Framework-bağımsız; NestJS, Next.js, vb. tüketiciler tarafından kullanılır.
 */

export * from './jwt/index.js';
export * from './password/index.js';
export * from './tokens/index.js';
export * from './two-factor/index.js';
export * from './permissions/index.js';
export * from './social/index.js';
export * from './roles.js';