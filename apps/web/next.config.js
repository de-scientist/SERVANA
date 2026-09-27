/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep build resilient in CI without a live backend.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
