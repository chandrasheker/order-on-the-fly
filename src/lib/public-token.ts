import { randomBytes } from "node:crypto";

/** 32 random bytes, hex-encoded. Not derived from bill/order IDs. */
export function generatePublicToken() {
  return randomBytes(32).toString("hex");
}

export function isHighEntropyPublicToken(token: string | null | undefined) {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}
