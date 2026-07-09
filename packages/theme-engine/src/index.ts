/**
 * @eticart/theme-engine — ortak giriş noktası.
 *
 * Tema motoru paketinin tüm modüllerini tek noktadan dışa aktarır:
 *  - types      → Tema, blok, menü, SEO tipleri
 *  - manifest   → Manifest Zod şeması + semver yardımcıları
 *  - tokens     → CSS değişken dönüşümü + override mekanizması
 *  - registry   → Blok kayıt sistemi (server-side render)
 *  - resolver   → Tenant domain → aktif tema çözümleme
 *  - runtime    → Next.js için yardımcılar (cache tag, canonical, vs.)
 *
 * Tüm modüller hem istemci hem sunucu tarafında tree-shake dostu.
 */

export * from './types/index.js';
export * from './manifest/index.js';
export * from './tokens/index.js';
export * from './registry/index.js';
export * from './resolver/index.js';
export * from './runtime/index.js';

// Faz 1'den gelen geriye uyumluluk için temel tipler
export type { HexColor, ThemeTokens } from './compat.js';
export { defaultThemes } from './compat.js';