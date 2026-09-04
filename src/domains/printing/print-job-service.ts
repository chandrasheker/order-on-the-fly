import { prisma } from "@/lib/prisma";
import { logInfo, logWarn } from "@/lib/logger";
import { recordAuditLog } from "@/lib/audit-service";
import { printJobOwnedByRestaurant } from "@/lib/payment-scope";
import type { Prisma, PrintJob, PrintJobStatus } from "@/generated/prisma/client";
import {
  PRINT_CLAIM_CANDIDATES,
  PRINT_IDLE_POLL_MS,
  PRINT_KIND,
  PRINT_LEASE_MS,
  PRINT_PAYLOAD_VERSION,
  customerBillIdempotencyKey,
  isAgentPullEnabled,
  isLegacyPrintPushEnabled,
  isTerminalPrintError,
  PRINT_ERROR,
  kitchenChitIdempotencyKey,
  nextPrintAttemptAt,
  publicPrintErrorMessage,
  targetFromKind,
} from "@/lib/print-constants";
import { createClaimToken } from "@/lib/printer-agent-auth";
import type { AuthenticatedPrinterAgent } from "@/lib/printer-agent-service";
import { touchPrinterAgent } from "@/lib/printer-agent-service";

type PrintDb = Prisma.TransactionClient | typeof prisma;

export type PrintJobPayload = Record<string, unknown>;

function parsePayload(raw: string): PrintJobPayload {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as PrintJobPayload) : {};
  } catch {
    return {};
  }
}

export async function enqueuePrintJob(params: {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  orderId?: string;
  kind?: string;
  target?: string;
  payload: PrintJobPayload;
  idempotencyKey?: string | null;
  reprintOfPrintJobId?: string | null;
}) {
  return enqueueIdempotentPrintJob(params);
}

export async function enqueueIdempotentPrintJobInTx(
  tx: PrintDb,
  params: {
    restaurantId: string;
    tenantId?: string | null;
    branchId?: string | null;
    orderId?: string;
    kind?: string;
    target?: string;
    payload: PrintJobPayload;
    idempotencyKey?: string | null;
    reprintOfPrintJobId?: string | null;
  },
) {
  const idempotencyKey = params.idempotencyKey?.trim() || null;
  const kind = params.kind ?? PRINT_KIND.KITCHEN_CHIT;
  const target = params.target ?? targetFromKind(kind);

  if (idempotencyKey) {
    const existing = await tx.printJob.findUnique({
      where: {
        restaurantId_idempotencyKey: {
          restaurantId: params.restaurantId,
          idempotencyKey,
        },
      },
    });
    if (existing) return existing;
  }

  try {
    const job = await tx.printJob.create({
      data: {
        restaurantId: params.restaurantId,
        tenantId: params.tenantId ?? null,
        branchId: params.branchId ?? null,
        orderId: params.orderId ?? null,
        kind,
        target,
        payloadVersion: PRINT_PAYLOAD_VERSION,
        payload: JSON.stringify(params.payload),
        status: "PENDING",
        nextAttemptAt: new Date(),
        idempotencyKey,
        reprintOfPrintJobId: params.reprintOfPrintJobId ?? null,
      },
    });
    logInfo("printing", "print_job_queued", {
      restaurantId: job.restaurantId,
      tenantId: job.tenantId,
      orderId: job.orderId,
      printJobId: job.id,
      kind: job.kind,
      target: job.target,
    });
    return job;
  } catch (error) {
    if (
      idempotencyKey &&
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const existing = await tx.printJob.findUnique({
        where: {
          restaurantId_idempotencyKey: {
            restaurantId: params.restaurantId,
            idempotencyKey,
          },
        },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function enqueueIdempotentPrintJob(params: {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  orderId?: string;
  kind?: string;
  target?: string;
  payload: PrintJobPayload;
  idempotencyKey?: string | null;
  reprintOfPrintJobId?: string | null;
}) {
  const job = await enqueueIdempotentPrintJobInTx(prisma, params);
  if (isLegacyPrintPushEnabled() && process.env.PRINTER_AGENT_URL) {
    void dispatchPrintJob(job.id).catch(() => undefined);
  }
  return job;
}

export async function enqueueKitchenChitForOrderInTx(
  tx: PrintDb,
  params: {
    restaurantId: string;
    tenantId?: string | null;
    branchId?: string | null;
    orderId: string;
    orderNumber: number;
    tableNumber: number;
    items?: Array<{ name: string; quantity: number; notes?: string | null }>;
    createdAt?: Date | string;
  },
) {
  return enqueueIdempotentPrintJobInTx(tx, {
    restaurantId: params.restaurantId,
    tenantId: params.tenantId,
    branchId: params.branchId,
    orderId: params.orderId,
    kind: PRINT_KIND.KITCHEN_CHIT,
    target: targetFromKind(PRINT_KIND.KITCHEN_CHIT),
    idempotencyKey: kitchenChitIdempotencyKey(params.orderId),
    payload: {
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      tableNumber: params.tableNumber,
      items: params.items ?? [],
      createdAt: params.createdAt ?? new Date().toISOString(),
    },
  });
}

export async function enqueueKitchenChitForOrder(params: {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  orderId: string;
  orderNumber: number;
  tableNumber: number;
  items?: Array<{ name: string; quantity: number; notes?: string | null }>;
  createdAt?: Date | string;
}) {
  const job = await enqueueKitchenChitForOrderInTx(prisma, params);
  if (isLegacyPrintPushEnabled() && process.env.PRINTER_AGENT_URL) {
    void dispatchPrintJob(job.id).catch(() => undefined);
  }
  return job;
}

export async function enqueueCustomerBillPrintInTx(
  tx: PrintDb,
  params: {
    restaurantId: string;
    tenantId?: string | null;
    branchId?: string | null;
    orderId: string;
    billId: string;
    payload: PrintJobPayload;
  },
) {
  return enqueueIdempotentPrintJobInTx(tx, {
    restaurantId: params.restaurantId,
    tenantId: params.tenantId,
    branchId: params.branchId,
    orderId: params.orderId,
    kind: PRINT_KIND.CUSTOMER_BILL,
    target: targetFromKind(PRINT_KIND.CUSTOMER_BILL),
    idempotencyKey: customerBillIdempotencyKey(params.billId),
    payload: params.payload,
  });
}

export async function dispatchPrintJob(jobId: string) {
  if (!isLegacyPrintPushEnabled()) {
    return prisma.printJob.findUnique({ where: { id: jobId } });
  }

  const job = await prisma.printJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "ACKED") return job;

  const agentUrl = process.env.PRINTER_AGENT_URL;
  if (!agentUrl) {
    logWarn("printing", "PRINTER_AGENT_URL not set — print job queued only", { jobId });
    return job;
  }

  await prisma.printJob.update({
    where: { id: jobId },
    data: { attempts: { increment: 1 }, status: "SENT", sentAt: new Date(), lastAttemptAt: new Date() },
  });

  try {
    const res = await fetch(`${agentUrl.replace(/\/$/, "")}/print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.PRINTER_AGENT_SECRET
          ? { Authorization: `Bearer ${process.env.PRINTER_AGENT_SECRET}` }
          : {}),
      },
      body: JSON.stringify({
        ackToken: job.ackToken,
        kind: job.kind,
        payload: parsePayload(job.payload),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Printer agent HTTP ${res.status}`);
    }

    logInfo("printing", "Print job sent — awaiting ack", { jobId });
    return prisma.printJob.findUnique({ where: { id: jobId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = job.attempts + 1 >= job.maxAttempts;
    return prisma.printJob.update({
      where: { id: jobId },
      data: {
        status: failed ? ("FAILED" as PrintJobStatus) : ("PENDING" as PrintJobStatus),
        lastError: message,
        lastErrorCode: failed ? undefined : "TEMPORARY_NETWORK",
        nextAttemptAt: failed ? null : nextPrintAttemptAt(job.attempts + 1),
      },
    });
  }
}

export async function acknowledgePrintJob(ackToken: string) {
  const job = await prisma.printJob.findUnique({ where: { ackToken } });
  if (!job) return null;
  if (job.status === "ACKED") return job;

  return prisma.printJob.update({
    where: { id: job.id },
    data: { status: "ACKED", ackedAt: new Date(), lastError: null, lastErrorCode: null },
  });
}

function expiredLeaseWhere(restaurantId?: string) {
  return {
    status: "SENT" as const,
    ...(restaurantId ? { restaurantId } : {}),
    OR: [{ leaseExpiresAt: { lte: new Date() } }, { leaseExpiresAt: null }],
  };
}

export function isUncertainPrintDelivery(job: {
  claimedByAgentId?: string | null;
  lastErrorCode?: string | null;
  status?: PrintJobStatus;
}) {
  if (!job.claimedByAgentId) return false;
  if (job.lastErrorCode === PRINT_ERROR.AMBIGUOUS_DELIVERY) return true;
  return job.status === "SENT";
}

export async function recoverExpiredPrintLeases(restaurantId?: string) {
  const where = expiredLeaseWhere(restaurantId);
  const pinned = await prisma.printJob.updateMany({
    where: { ...where, claimedByAgentId: { not: null } },
    data: {
      status: "PENDING",
      claimToken: null,
      leaseExpiresAt: null,
      nextAttemptAt: new Date(),
      lastErrorCode: PRINT_ERROR.AMBIGUOUS_DELIVERY,
      lastError: publicPrintErrorMessage(PRINT_ERROR.AMBIGUOUS_DELIVERY),
    },
  });
  const unscoped = await prisma.printJob.updateMany({
    where: { ...where, claimedByAgentId: null },
    data: {
      status: "PENDING",
      claimToken: null,
      leaseExpiresAt: null,
      nextAttemptAt: new Date(),
    },
  });
  return pinned.count + unscoped.count;
}

function claimEligibility(agent: AuthenticatedPrinterAgent, now: Date) {
  return {
    restaurantId: agent.restaurantId,
    status: "PENDING" as const,
    target: { in: agent.allowedTargets },
    ...(agent.branchId ? { branchId: agent.branchId } : {}),
    AND: [
      { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      { OR: [{ claimedByAgentId: null }, { claimedByAgentId: agent.id }] },
    ],
  };
}

export async function claimNextPrintJob(agent: AuthenticatedPrinterAgent, version?: string) {
  if (!isAgentPullEnabled()) {
    return { job: null, pollAfterMs: PRINT_IDLE_POLL_MS };
  }

  await recoverExpiredPrintLeases(agent.restaurantId);
  await touchPrinterAgent({ agentId: agent.id, version: version ?? null });

  const now = new Date();
  const candidates = await prisma.printJob.findMany({
    where: claimEligibility(agent, now),
    orderBy: { createdAt: "asc" },
    take: PRINT_CLAIM_CANDIDATES,
    select: { id: true },
  });

  for (const candidate of candidates) {
    const claimToken = createClaimToken();
    const leaseExpiresAt = new Date(Date.now() + PRINT_LEASE_MS);
    const claimed = await prisma.printJob.updateMany({
      where: {
        id: candidate.id,
        ...claimEligibility(agent, now),
      },
      data: {
        status: "SENT",
        claimedByAgentId: agent.id,
        claimToken,
        leaseExpiresAt,
        sentAt: now,
        lastAttemptAt: now,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) continue;

    const job = await prisma.printJob.findUnique({ where: { id: candidate.id } });
    if (!job) continue;
    logInfo("printing", "print_job_claimed", {
      restaurantId: agent.restaurantId,
      agentId: agent.id,
      printJobId: job.id,
      attempt: job.attempts,
    });
    return {
      job: {
        id: job.id,
        deliveryKey: job.ackToken,
        claimToken,
        kind: job.kind,
        target: job.target,
        payloadVersion: job.payloadVersion,
        payload: parsePayload(job.payload),
        attempt: job.attempts,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
      },
      pollAfterMs: PRINT_IDLE_POLL_MS,
    };
  }

  return { job: null, pollAfterMs: PRINT_IDLE_POLL_MS };
}

export async function reportPrintJobResult(params: {
  agent: AuthenticatedPrinterAgent;
  jobId: string;
  claimToken: string;
  outcome: "ACKED" | "FAILED" | "AMBIGUOUS";
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  if (!isAgentPullEnabled()) {
    return { ok: false as const, error: "Agent pull is disabled", status: 409 };
  }

  const job = await prisma.printJob.findFirst({
    where: { id: params.jobId, restaurantId: params.agent.restaurantId },
  });
  if (!job) return { ok: false as const, error: "Not found", status: 404 };

  if (job.status === "ACKED") {
    return { ok: true as const, job, idempotent: true as const };
  }

  if (job.claimedByAgentId !== params.agent.id || job.claimToken !== params.claimToken) {
    return { ok: false as const, error: "Stale claim", status: 409 };
  }

  if (params.outcome === "ACKED") {
    const updated = await prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: "ACKED",
        ackedAt: new Date(),
        lastError: null,
        lastErrorCode: null,
      },
    });
    logInfo("printing", "print_job_acked", {
      restaurantId: job.restaurantId,
      printJobId: job.id,
      agentId: params.agent.id,
    });
    return { ok: true as const, job: updated };
  }

  const errorCode =
    params.outcome === "AMBIGUOUS" ? PRINT_ERROR.AMBIGUOUS_DELIVERY : params.errorCode ?? "PRINTER_OFFLINE";
  const lastError = publicPrintErrorMessage(errorCode, params.errorMessage);
  const uncertain = params.outcome === "AMBIGUOUS" || errorCode === PRINT_ERROR.AMBIGUOUS_DELIVERY;
  const terminal = uncertain || isTerminalPrintError(errorCode) || job.attempts >= job.maxAttempts;
  const updated = await prisma.printJob.update({
    where: { id: job.id },
    data: terminal
      ? {
          status: "FAILED",
          lastError,
          lastErrorCode: errorCode,
          claimToken: null,
          leaseExpiresAt: null,
          claimedByAgentId: uncertain ? job.claimedByAgentId : null,
        }
      : {
          status: "PENDING",
          lastError,
          lastErrorCode: errorCode,
          claimToken: null,
          claimedByAgentId: null,
          leaseExpiresAt: null,
          nextAttemptAt: nextPrintAttemptAt(job.attempts),
        },
  });
  logInfo("printing", terminal ? "print_job_failed" : "print_job_retry", {
    restaurantId: job.restaurantId,
    printJobId: job.id,
    errorCode,
  });
  return { ok: true as const, job: updated };
}

export async function retryPendingPrintJobs(limit = 10) {
  await recoverExpiredPrintLeases();
  if (!isLegacyPrintPushEnabled()) return 0;

  const pending = await prisma.printJob.findMany({
    where: { status: { in: ["PENDING", "SENT"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const job of pending) {
    if (job.status === "SENT" && job.sentAt) {
      const ageMs = Date.now() - job.sentAt.getTime();
      if (ageMs < 30_000) continue;
    }
    await dispatchPrintJob(job.id);
  }

  return pending.length;
}

export async function listPrintJobs(restaurantId: string, limit = 50) {
  return prisma.printJob.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function printQueueSummary(restaurantId: string) {
  const [pending, sent, failed, acked] = await Promise.all([
    prisma.printJob.count({ where: { restaurantId, status: "PENDING" } }),
    prisma.printJob.count({ where: { restaurantId, status: "SENT" } }),
    prisma.printJob.count({ where: { restaurantId, status: "FAILED" } }),
    prisma.printJob.count({ where: { restaurantId, status: "ACKED" } }),
  ]);
  return { pending, sent, failed, acked };
}

export function publicPrintJob(job: PrintJob) {
  const payload = parsePayload(job.payload);
  return {
    id: job.id,
    kind: job.kind,
    target: job.target,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    lastError: publicPrintErrorMessage(job.lastErrorCode, job.lastError),
    lastErrorCode: job.lastErrorCode,
    orderId: job.orderId,
    createdAt: job.createdAt,
    sentAt: job.sentAt,
    ackedAt: job.ackedAt,
    reprintOfPrintJobId: job.reprintOfPrintJobId,
    deliveryKey: job.ackToken,
    orderNumber: payload.orderNumber ?? null,
    tableNumber: payload.tableNumber ?? null,
    billNumber: payload.billNumber ?? (payload.order && typeof payload.order === "object"
      ? (payload as { order?: { billNumber?: string } }).order?.billNumber
      : null),
  };
}

export async function retryPrintJobForRestaurant(jobId: string, restaurantId: string) {
  const job = printJobOwnedByRestaurant(
    restaurantId,
    await prisma.printJob.findFirst({ where: { id: jobId, restaurantId } }),
  );
  if (!job) return null;
  if (job.status === "ACKED") return job;

  const reset = await prisma.printJob.update({
    where: { id: job.id },
    data: {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      claimToken: null,
      claimedByAgentId: isUncertainPrintDelivery(job) ? job.claimedByAgentId : null,
      leaseExpiresAt: null,
    },
  });
  logInfo("printing", "print_job_retry", { restaurantId, printJobId: job.id, manual: true });
  if (isLegacyPrintPushEnabled() && process.env.PRINTER_AGENT_URL) {
    return dispatchPrintJob(reset.id);
  }
  return reset;
}

export async function reprintPrintJobForRestaurant(params: {
  jobId: string;
  restaurantId: string;
  actorUserId?: string;
  actorName?: string;
}) {
  const original = printJobOwnedByRestaurant(
    params.restaurantId,
    await prisma.printJob.findFirst({ where: { id: params.jobId, restaurantId: params.restaurantId } }),
  );
  if (!original) return null;

  const reprint = await enqueueIdempotentPrintJob({
    restaurantId: original.restaurantId,
    tenantId: original.tenantId,
    branchId: original.branchId,
    orderId: original.orderId ?? undefined,
    kind: original.kind,
    target: original.target || targetFromKind(original.kind),
    payload: parsePayload(original.payload),
    reprintOfPrintJobId: original.id,
    idempotencyKey: `reprint:${original.id}:${createClaimToken()}`,
  });

  await recordAuditLog({
    restaurantId: original.restaurantId,
    actionType: "PRINT_REPRINT",
    entityId: reprint.id,
    payload: { reprintOfPrintJobId: original.id, kind: original.kind, orderId: original.orderId },
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    branchId: original.branchId,
  });

  return reprint;
}

export { kitchenChitIdempotencyKey, customerBillIdempotencyKey };
