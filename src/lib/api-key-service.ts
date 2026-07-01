import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

function hashKey(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateApiKeyRaw() {
  return `tt_${crypto.randomBytes(24).toString("hex")}`;
}

export async function createApiKey(params: {
  restaurantId: string;
  name: string;
  scopes?: string[];
}) {
  const raw = generateApiKeyRaw();
  const keyHash = hashKey(raw);
  const keyPrefix = raw.slice(0, 12);

  const row = await prisma.apiKey.create({
    data: {
      restaurantId: params.restaurantId,
      name: params.name.trim(),
      keyHash,
      keyPrefix,
      scopes: JSON.stringify(params.scopes ?? ["orders:read", "menu:read"]),
    },
  });

  return { apiKey: row, secret: raw };
}

export async function verifyApiKey(bearer: string) {
  if (!bearer.startsWith("tt_")) return null;

  const keyHash = hashKey(bearer);
  const row = await prisma.apiKey.findFirst({
    where: { keyHash, revokedAt: null },
  });
  if (!row) return null;

  void prisma.apiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    restaurantId: row.restaurantId,
    scopes: JSON.parse(row.scopes) as string[],
    keyId: row.id,
  };
}

export async function listApiKeys(restaurantId: string) {
  return prisma.apiKey.findMany({
    where: { restaurantId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
}

export async function revokeApiKey(restaurantId: string, id: string) {
  return prisma.apiKey.updateMany({
    where: { id, restaurantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function requireScope(scopes: string[], required: string) {
  return scopes.includes(required) || scopes.includes("*");
}
