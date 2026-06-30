import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "pg",
    "@prisma/adapter-pg",
  ],
};

export default nextConfig;
