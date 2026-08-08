/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      { source: '/', destination: '/index.html' },
    ];
  },
  async headers() {
    return [
      {
        // Tell browsers never to cache Next.js JS bundles with stale content
        source: '/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
  webpack: (config, { webpack, nextRuntime }) => {
    // @next/env (bundled into Edge middleware by Next.js) references __dirname,
    // which doesn't exist in the Edge runtime. Polyfill it to prevent the
    // "ReferenceError: __dirname is not defined" crash on Vercel.
    if (nextRuntime === "edge") {
      config.plugins.push(
        new webpack.DefinePlugin({ __dirname: JSON.stringify("/") })
      );
    }
    return config;
  },
};

module.exports = nextConfig;
