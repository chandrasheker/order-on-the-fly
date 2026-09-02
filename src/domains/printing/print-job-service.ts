import { prisma } from "@/lib/prisma";
import { logInfo, logWarn } from "@/lib/logger";
import { recordAuditLog } from "@/lib/audit-service";
import { printJobOwnedByRestaurant } from "@/lib/payment-scope";
import type { PrintJobStatus } from "@/generated/prisma/client";

export async function enqueuePrintJob(params: {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  orderId?: string;
  kind?: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
  reprintOfPrintJobId?: string | null;
}) {
  return enqueueIdempotentPrintJob(params);
}

export async function enqueueIdempotentPrintJob(params: {
  restaurantId: string;
  tenantId?: string | null;
  branchId?: string | null;
  orderId?: string;
  kind?: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
  reprintOfPrintJobId?: string | null;
}) {
  const idempotencyKey = params.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const existing = await prisma.printJob.findUnique({
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
    const job = await prisma.printJob.create({
      data: {
        restaurantId: params.restaurantId,
        tenantId: params.tenantId ?? null,
        branchId: params.branchId ?? null,
        orderId: params.orderId ?? null,
        kind: params.kind ?? "kitchen_chit",
        payload: JSON.stringify(params.payload),
        status: "PENDING",
        idempotencyKey,
        reprintOfPrintJobId: params.reprintOfPrintJobId ?? null,
      },
    });

    logInfo("printing", "Print job queued", {
      restaurantId: job.restaurantId,
      tenantId: job.tenantId,
      orderId: job.orderId,
      printJobId: job.id,
      kind: job.kind,
    });

    if (process.env.PRINTER_AGENT_URL) {
      void dispatchPrintJob(job.id).catch(() => undefined);
    }

    return job;
  } catch (error) {
    if (
      idempotencyKey &&
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const existing = await prisma.printJob.findUnique({
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

export async function dispatchPrintJob(jobId: string) {
  const job = await prisma.printJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "ACKED") return job;

  const agentUrl = process.env.PRINTER_AGENT_URL;
  if (!agentUrl) {
    logWarn("printing", "PRINTER_AGENT_URL not set — print job queued only", { jobId });
    return job;
  }

  await prisma.printJob.update({
    where: { id: jobId },
    data: { attempts: { increment: 1 }, status: "SENT", sentAt: new Date() },
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
        payload: JSON.parse(job.payload),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Printer agent HTTP ${res.status}`);
    }

    logInfo("printing", "Print job sent — awaiting ack", { jobId, ackToken: job.ackToken });
    return prisma.printJob.findUnique({ where: { id: jobId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = job.attempts + 1 >= job.maxAttempts;
    return prisma.printJob.update({
      where: { id: jobId },
      data: {
        status: failed ? ("FAILED" as PrintJobStatus) : ("PENDING" as PrintJobStatus),
        lastError: message,
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
    data: { status: "ACKED", ackedAt: new Date(), lastError: null },
  });
}

export async function retryPendingPrintJobs(limit = 10) {
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

export async function retryPrintJobForRestaurant(jobId: string, restaurantId: string) {
  const job = printJobOwnedByRestaurant(
    restaurantId,
    await prisma.printJob.findFirst({ where: { id: jobId, restaurantId } }),
  );
  if (!job) return null;
  if (job.status === "ACKED") return job;
  return dispatchPrintJob(job.id);
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
    kind: original.kind === "customer_bill" ? "customer_bill" : original.kind,
    payload: JSON.parse(original.payload) as Record<string, unknown>,
    reprintOfPrintJobId: original.id,
    idempotencyKey: `reprint:${original.id}:${Date.now()}`,
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
