import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "tt_pa_";

export function hashPrinterAgentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function printerAgentTokenPrefix(token: string) {
  if (token.length < 16) return TOKEN_PREFIX;
  return `${token.slice(0, 10)}…${token.slice(-4)}`;
}

export function createPrinterAgentToken(agentId: string) {
  const secret = randomBytes(32).toString("hex");
  return `${TOKEN_PREFIX}${agentId}_${secret}`;
}

export function parsePrinterAgentToken(raw?: string | null) {
  const token = raw?.trim() ?? "";
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const rest = token.slice(TOKEN_PREFIX.length);
  const split = rest.indexOf("_");
  if (split <= 0 || split === rest.length - 1) return null;
  const agentId = rest.slice(0, split);
  const secret = rest.slice(split + 1);
  if (!agentId || secret.length < 32) return null;
  return { token, agentId, secret };
}

export function tokensMatch(storedHash: string, presentedToken: string) {
  const presented = hashPrinterAgentToken(presentedToken);
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(presented, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function bearerTokenFromHeader(authorization?: string | null) {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

export function createClaimToken() {
  return randomBytes(32).toString("hex");
}
