import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // packages/db, packages/llm and packages/email are source-only
    // workspace packages: their internal imports use the ".js" extension
    // Node's ESM loader requires, even though the files are .ts/.tsx.
    // Webpack doesn't apply TS's "resolve .js to .ts" rule by default, so
    // map it explicitly.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
