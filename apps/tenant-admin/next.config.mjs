/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker standalone build için gerekli
  output: 'standalone',

  transpilePackages: ['@eticart/ui', '@eticart/config'],
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
