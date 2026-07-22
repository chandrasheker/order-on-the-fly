import type { NextConfig } from "next";

const lowMemory = process.env.LOW_MEMORY === "1";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  turbopack: {},
  experimental: {
    webpackMemoryOptimizations: true,
    // Allow admin image uploads (guest background up to 8 MB) through middleware/proxy buffering.
    proxyClientMaxBodySize: "12mb",
    ...(lowMemory
      ? {
          webpackBuildWorker: false,
          cpus: 1,
        }
      : {}),
  },
  ...(lowMemory
    ? {
        webpack: (config, { dev }) => {
          if (!dev) {
            config.parallelism = 1;
            config.cache = { type: "memory", maxGenerations: 1 };
          }
          return config;
        },
      }
    : {}),
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "pg",
    "@prisma/adapter-pg",
    "ioredis",
    "web-push",
  ],
};

export default nextConfig;
