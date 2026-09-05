import type { NextConfig } from "next";

const lowMemory = process.env.LOW_MEMORY === "1";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  turbopack: {},
  experimental: {
    webpackMemoryOptimizations: true,
    // Menu import allows up to 50 MiB of PDF/images plus multipart overhead.
    proxyClientMaxBodySize: "55mb",
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
    "sharp",
    "@aws-sdk/client-s3",
    "pdfjs-dist",
    "pdf-lib",
    "@napi-rs/canvas",
    "@napi-rs/canvas-linux-x64-gnu",
    "tesseract.js",
  ],
};

export default nextConfig;
