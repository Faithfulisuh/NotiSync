/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  typescript: {
    // Allow production builds to complete even if there are type errors
    ignoreBuildErrors: true,
  },
  eslint: {
    // Allow production builds to complete even if there are ESLint errors
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig