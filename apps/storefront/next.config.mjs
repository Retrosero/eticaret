/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker standalone build için gerekli
  output: 'standalone',

  // Monorepo içinde @eticart/* paketlerini doğru çözümle
  transpilePackages: ['@eticart/ui', '@eticart/config'],

  // Geliştirme esnasında tenant domain resolver testi için wildcard kullanılır
  // Üretimde: tek bir domain gösterilir (Coolify/Caddy sonlandırması öncesi)
  experimental: {
    // reactStrictMode üretimde de açık
    // reactCompiler Faz 1'de kapalı
  },

  poweredByHeader: false, // KVKK: X-Powered-By sızdırma
  compress: true,

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
