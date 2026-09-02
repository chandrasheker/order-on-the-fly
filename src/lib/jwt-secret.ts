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

export function getJwtSecretValue(): string {
  return assertJwtSecretForEnv(process.env.NODE_ENV, process.env.JWT_SECRET);
}

export function getJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecretValue());
}
