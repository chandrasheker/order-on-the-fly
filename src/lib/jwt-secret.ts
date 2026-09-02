/** Edge-safe JWT secret helpers. No Node-only APIs. */

export const INSECURE_JWT_SECRETS = new Set([
  "tabletap-super-secret-key-change-in-production",
  "change-this-to-a-secure-random-string-in-production",
  "changeme",
  "secret",
  "jwt-secret",
]);

export function isInsecureJwtSecret(secret: string | undefined | null): boolean {
  const value = String(secret ?? "").trim();
  if (value.length < 32) return true;
  return INSECURE_JWT_SECRETS.has(value);
}

export function assertJwtSecretForEnv(
  nodeEnv: string | undefined,
  secret: string | undefined | null,
): string {
  const value = String(secret ?? "").trim();
  if (nodeEnv === "production") {
    if (isInsecureJwtSecret(value)) {
      throw new Error("Production requires a strong JWT_SECRET (32+ characters, not a placeholder)");
    }
    return value;
  }
  return value || "tabletap-super-secret-key-change-in-production";
}

/** `next build` page-data collection sets NODE_ENV=production; do not fail closed there. */
export function isNextJsProductionBuild(
  phase = process.env.NEXT_PHASE,
  npmLifecycle = process.env.npm_lifecycle_event,
): boolean {
  if (process.env.TABLETAP_PRODUCTION_BUILD === "1") return true;
  if (phase === "phase-production-build" || phase === "phase-export") return true;
  return npmLifecycle === "build";
}

export function getJwtSecretValue(
  env: { NODE_ENV?: string; JWT_SECRET?: string; NEXT_PHASE?: string } = process.env,
): string {
  if (env.NODE_ENV === "production" && isNextJsProductionBuild(env.NEXT_PHASE)) {
    const value = String(env.JWT_SECRET ?? "").trim();
    return value || "tabletap-super-secret-key-change-in-production";
  }
  return assertJwtSecretForEnv(env.NODE_ENV, env.JWT_SECRET);
}

export function getJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecretValue());
}
