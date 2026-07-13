/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
