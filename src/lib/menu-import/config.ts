export type MenuImportProviderName = "none" | "mock" | "openai";

export type MenuImportRuntimeConfig = {
  provider: MenuImportProviderName;
  configured: boolean;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs: number;
};

type EnvMap = Record<string, string | undefined>;

function envTrim(env: EnvMap, key: string) {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

export function resolveMenuImportConfig(env: EnvMap = process.env): MenuImportRuntimeConfig {
  const raw = (envTrim(env, "MENU_IMPORT_PROVIDER") || "none").toLowerCase();
  const provider: MenuImportProviderName =
    raw === "mock" || raw === "openai" || raw === "none" ? raw : "none";
  const apiKey = envTrim(env, "MENU_IMPORT_API_KEY") || undefined;
  const model = envTrim(env, "MENU_IMPORT_MODEL") || (provider === "openai" ? "gpt-4o-mini" : undefined);
  const baseUrl = envTrim(env, "MENU_IMPORT_BASE_URL") || undefined;
  const timeoutRaw = Number(envTrim(env, "MENU_IMPORT_TIMEOUT_MS") || "45000");
  const timeoutMs = Number.isFinite(timeoutRaw)
    ? Math.min(120_000, Math.max(5_000, Math.round(timeoutRaw)))
    : 45_000;

  if (provider === "mock") {
    return { provider, configured: true, timeoutMs };
  }
  if (provider === "openai" && apiKey) {
    return { provider, configured: true, apiKey, model, baseUrl, timeoutMs };
  }
  return { provider: provider === "openai" ? "openai" : "none", configured: false, model, baseUrl, timeoutMs };
}

export function publicMenuImportConfig(env: EnvMap = process.env) {
  const config = resolveMenuImportConfig(env);
  return {
    provider: config.configured ? config.provider : "none",
    configured: config.configured,
    model: config.configured ? config.model : undefined,
  };
}
