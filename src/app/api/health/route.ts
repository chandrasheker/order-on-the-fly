import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRedisConfigured, getRedis } from "@/lib/redis";
import { processPendingJobs } from "@/lib/job-queue";
import fs from "node:fs";
import path from "node:path";

export async function GET() {
  const checks: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    nodeEnv: process.env.NODE_ENV ?? "development",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "connected";
  } catch (err) {
    checks.database = "error";
    checks.status = "degraded";
    checks.dbError = err instanceof Error ? err.message : String(err);
  }

  checks.redis = isRedisConfigured() ? "configured" : "not_configured";
  if (isRedisConfigured()) {
    try {
      const redis = await getRedis();
      checks.redis = redis ? "connected" : "unavailable";
    } catch {
      checks.redis = "unavailable";
    }
  }

  const schemaPath = path.resolve(
    process.cwd(),
    process.env.PRISMA_SCHEMA || "prisma/schema.prisma",
  );
  const migrationsPath = path.resolve(
    process.cwd(),
    process.env.PRISMA_MIGRATIONS || "prisma/migrations",
  );
  checks.schema = fs.existsSync(schemaPath) ? path.basename(schemaPath) : "missing";
  checks.migrationsDir = fs.existsSync(migrationsPath)
    ? fs.readdirSync(migrationsPath).filter((f) => !f.includes(".")).sort().pop() ?? "none"
    : "missing";

  if (process.env.HEALTH_PROCESS_JOBS === "1") {
    checks.jobsProcessed = await processPendingJobs(10);
  }

  const statusCode = checks.status === "ok" ? 200 : 503;
  return NextResponse.json(checks, { status: statusCode });
}
