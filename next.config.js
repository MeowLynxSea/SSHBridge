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
    // Add support for .js extensions in imports
    config.resolve.extensions = [...config.resolve.extensions, '.js', '.jsx', '.ts', '.tsx'];
    return config;
  },
  // Enable standalone output for Docker
  output: 'standalone',
  // Disable Turbopack to use webpack for now (Turbopack has issues with .js extensions)
  // experimental: {
  //   turbo: {
  //     resolveExtension: ['.js', '.jsx', '.ts', '.tsx'],
  //   },
  // },
};

export default nextConfig;
