import { installCrashHandlers } from "@/lib/crash-dump";
import { validateAppConfig } from "@/config/app-config";
import { isNextJsProductionBuild } from "@/lib/jwt-secret";
import "@/platform/event-bus/register-subscribers";

installCrashHandlers("next-instrumentation");

try {
  validateAppConfig();
} catch (err) {
  console.error("[config] Startup validation failed:", err instanceof Error ? err.message : err);
  if (process.env.NODE_ENV === "production" && !isNextJsProductionBuild()) {
    throw err;
  }
}
