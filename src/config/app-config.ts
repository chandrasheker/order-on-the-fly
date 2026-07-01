import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 characters in production")
    .optional(),
  REDIS_URL: z.string().url().optional().or(z.literal("")),
  PRINTER_AGENT_URL: z.string().url().optional().or(z.literal("")),
  PRINTER_AGENT_SECRET: z.string().optional(),
  JOB_CRON_SECRET: z.string().optional(),
  SMS_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  EVENT_BUS_INLINE: z.enum(["0", "1"]).optional(),
  JOB_QUEUE_INLINE: z.enum(["0", "1"]).optional(),
  PRISMA_SCHEMA: z.string().optional(),
  PRISMA_MIGRATIONS: z.string().optional(),
  RESTAURANT_CONFIG: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema> & {
  isProduction: boolean;
  isPostgres: boolean;
};

let cached: AppConfig | null = null;

export function loadAppConfig(options?: { strict?: boolean }): AppConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid application configuration: ${msg}`);
  }

  const isProduction = parsed.data.NODE_ENV === "production";
  if (options?.strict !== false && isProduction) {
    if (!parsed.data.JWT_SECRET || parsed.data.JWT_SECRET.length < 32) {
      throw new Error("Production requires JWT_SECRET with at least 32 characters");
    }
    if (!process.env.DATABASE_URL && !process.env.PRISMA_SCHEMA?.includes("sqlite")) {
      // allow sqlite file default in dev only
    }
  }

  const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
  cached = {
    ...parsed.data,
    isProduction,
    isPostgres: dbUrl.startsWith("postgres"),
  };
  return cached;
}

export function validateAppConfig() {
  return loadAppConfig({ strict: true });
}

export function resetAppConfigCache() {
  cached = null;
}
