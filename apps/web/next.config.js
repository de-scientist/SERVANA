/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  // Keep build resilient in CI without a live backend.
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const apiBase = process.env.API_BASE_URL ?? '';
    const connectSrc = ["'self'", apiBase].filter(Boolean).join(' ');
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      `connect-src ${connectSrc}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    const headers = [
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: csp },
    ];
    if (isProd) {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      });
    }
    return [{ source: '/:path*', headers }];
  },
};

module.exports = nextConfig;
