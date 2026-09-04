import { prisma } from "@/lib/prisma";
import { logInfo, logWarn } from "@/lib/logger";
import {
  PRINT_AGENT_ONLINE_MS,
  PRINT_TARGETS,
  parseAllowedTargets,
  type PrintTarget,
} from "@/lib/print-constants";
import {
  bearerTokenFromHeader,
  createPrinterAgentToken,
  hashPrinterAgentToken,
  parsePrinterAgentToken,
  printerAgentTokenPrefix,
  tokensMatch,
} from "@/lib/printer-agent-auth";

export type AuthenticatedPrinterAgent = {
  id: string;
  restaurantId: string;
  tenantId: string | null;
  branchId: string | null;
  name: string;
  enabled: boolean;
  revokedAt: Date | null;
  allowedTargets: PrintTarget[];
};

function publicAgent(row: {
  id: string;
  restaurantId: string;
  branchId: string | null;
  name: string;
  tokenPrefix: string;
  enabled: boolean;
  allowedTargetsJson: string;
  lastSeenAt: Date | null;
  version: string | null;
  lastError: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}) {
  const lastSeenAt = row.lastSeenAt;
  const online = Boolean(lastSeenAt && Date.now() - lastSeenAt.getTime() < PRINT_AGENT_ONLINE_MS);
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    branchId: row.branchId,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    enabled: row.enabled && !row.revokedAt,
    allowedTargets: parseAllowedTargets(row.allowedTargetsJson),
    lastSeenAt,
    version: row.version,
    lastError: row.lastError,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    status: row.revokedAt || !row.enabled ? "Disabled" : online ? "Online" : "Offline",
  };
}

export async function listPrinterAgents(restaurantId: string) {
  const rows = await prisma.printerAgent.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(publicAgent);
}

export async function createPrinterAgent(params: {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  name: string;
  allowedTargets?: string[];
  createdByUserId?: string;
  createdByName?: string;
}) {
  const name = params.name.trim();
  if (!name) return { ok: false as const, error: "Name is required", status: 400 };
  const allowedTargets = (params.allowedTargets?.length ? params.allowedTargets : [...PRINT_TARGETS]).filter(
    (item): item is PrintTarget => PRINT_TARGETS.includes(item as PrintTarget),
  );
  if (!allowedTargets.length) {
    return { ok: false as const, error: "Choose at least one print target", status: 400 };
  }

  const agent = await prisma.printerAgent.create({
    data: {
      restaurantId: params.restaurantId,
      tenantId: params.tenantId ?? null,
      branchId: params.branchId ?? null,
      name,
      tokenHash: "pending",
      tokenPrefix: "pending",
      allowedTargetsJson: JSON.stringify(allowedTargets),
      createdByUserId: params.createdByUserId,
      createdByName: params.createdByName,
    },
  });
  const token = createPrinterAgentToken(agent.id);
  const updated = await prisma.printerAgent.update({
    where: { id: agent.id },
    data: {
      tokenHash: hashPrinterAgentToken(token),
      tokenPrefix: printerAgentTokenPrefix(token),
    },
  });
  logInfo("printing", "agent_created", { restaurantId: params.restaurantId, agentId: agent.id });
  return { ok: true as const, agent: publicAgent(updated), token };
}

export async function updatePrinterAgent(params: {
  restaurantId: string;
  agentId: string;
  name?: string;
  branchId?: string | null;
  allowedTargets?: string[];
  enabled?: boolean;
  rotateToken?: boolean;
  revoke?: boolean;
}) {
  const existing = await prisma.printerAgent.findFirst({
    where: { id: params.agentId, restaurantId: params.restaurantId },
  });
  if (!existing) return { ok: false as const, error: "Not found", status: 404 };

  const data: Record<string, unknown> = {};
  if (typeof params.name === "string" && params.name.trim()) data.name = params.name.trim();
  if (params.branchId !== undefined) data.branchId = params.branchId;
  if (params.allowedTargets) {
    const allowedTargets = params.allowedTargets.filter((item): item is PrintTarget =>
      PRINT_TARGETS.includes(item as PrintTarget),
    );
    if (!allowedTargets.length) {
      return { ok: false as const, error: "Choose at least one print target", status: 400 };
    }
    data.allowedTargetsJson = JSON.stringify(allowedTargets);
  }
  if (typeof params.enabled === "boolean") data.enabled = params.enabled;
  let token: string | undefined;
  if (params.rotateToken) {
    token = createPrinterAgentToken(existing.id);
    data.tokenHash = hashPrinterAgentToken(token);
    data.tokenPrefix = printerAgentTokenPrefix(token);
    data.revokedAt = null;
    data.enabled = true;
  }
  if (params.revoke) {
    data.revokedAt = new Date();
    data.enabled = false;
  }

  const updated = await prisma.printerAgent.update({
    where: { id: existing.id },
    data,
  });
  logInfo("printing", params.revoke ? "agent_revoked" : params.rotateToken ? "agent_token_rotated" : "agent_updated", {
    restaurantId: params.restaurantId,
    agentId: existing.id,
  });
  return { ok: true as const, agent: publicAgent(updated), token };
}

export async function authenticatePrinterAgent(authorization?: string | null) {
  const raw = bearerTokenFromHeader(authorization);
  const parsed = parsePrinterAgentToken(raw);
  if (!parsed) {
    logWarn("printing", "agent_auth_failed", { reason: "malformed" });
    return null;
  }
  const agent = await prisma.printerAgent.findUnique({ where: { id: parsed.agentId } });
  if (!agent || !tokensMatch(agent.tokenHash, parsed.token)) {
    logWarn("printing", "agent_auth_failed", { reason: "mismatch" });
    return null;
  }
  if (!agent.enabled || agent.revokedAt) {
    logWarn("printing", "agent_auth_failed", { reason: "revoked", agentId: agent.id });
    return null;
  }
  return {
    id: agent.id,
    restaurantId: agent.restaurantId,
    tenantId: agent.tenantId,
    branchId: agent.branchId,
    name: agent.name,
    enabled: agent.enabled,
    revokedAt: agent.revokedAt,
    allowedTargets: parseAllowedTargets(agent.allowedTargetsJson),
  } satisfies AuthenticatedPrinterAgent;
}

export async function touchPrinterAgent(params: {
  agentId: string;
  version?: string | null;
  lastError?: string | null;
}) {
  await prisma.printerAgent.update({
    where: { id: params.agentId },
    data: {
      lastSeenAt: new Date(),
      version: params.version ?? undefined,
      lastError: params.lastError ?? undefined,
    },
  });
}
