/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configure Turbopack to handle CSS modules properly with ES modules
  turbopack: {
    rules: {
      '*.svg': ['@svgr/webpack'],
    },
  },
  // Configure webpack for fallback (used when not in Turbopack mode)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
