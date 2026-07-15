import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker standalone build için gerekli
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,

  // Monorepo içinde @eticart/* paketlerini doğru çözümle
  transpilePackages: ['@eticart/ui', '@eticart/config', '@eticart/theme-engine', '@eticart/storefront-sdk'],

  // Geliştirme esnasında tenant domain resolver testi için wildcard kullanılır
  // Üretimde: tek bir domain gösterilir (Coolify/Caddy sonlandırması öncesi)
  experimental: {
    externalDir: true,
    // reactStrictMode üretimde de açık
    // reactCompiler Faz 1'de kapalı
  },

  poweredByHeader: false, // KVKK: X-Powered-By sızdırma
  compress: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn.eticart.com.tr' },
      { protocol: 'https', hostname: 'media.eticart.com.tr' },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
