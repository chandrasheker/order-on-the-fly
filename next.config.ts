import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

export default nextConfig;
