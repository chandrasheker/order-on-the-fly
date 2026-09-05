import { prisma } from "@/lib/prisma";
import { logInfo, logWarn } from "@/lib/logger";
import type { JobStatus } from "@/generated/prisma/client";
import { AUDIT_ACTION, AUDIT_CATEGORY, AUDIT_EVENT_KIND, AUDIT_SEVERITY } from "@/platform/forensics/constants";
import { tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";
import {
  getForensicContext,
  runWithWorkerForensicContext,
  setForensicCorrelationId,
  setForensicResource,
  setForensicTenant,
} from "@/platform/forensics/request-context";

export type JobType =
  | "push_notification"
  | "sms_notification"
  | "print_job"
  | "analytics"
  | "recipe_deduct"
  | "platform_event";

export async function enqueueJob(params: {
  type: JobType;
  payload: Record<string, unknown>;
  restaurantId?: string;
  scheduledAt?: Date;
}) {
  const row = await prisma.backgroundJob.create({
    data: {
      type: params.type,
      payload: JSON.stringify(params.payload),
      restaurantId: params.restaurantId ?? null,
      scheduledAt: params.scheduledAt ?? new Date(),
      status: "PENDING",
    },
  });

  if (process.env.JOB_QUEUE_INLINE !== "0") {
    void processJobById(row.id).catch(() => undefined);
  }

  return row;
}

async function handleJob(type: JobType, payload: Record<string, unknown>) {
  switch (type) {
    case "push_notification": {
      const { sendPushToRestaurant } = await import("@/lib/push-notification-service");
      await sendPushToRestaurant(String(payload.restaurantId), {
        title: String(payload.title ?? "Alert"),
        body: String(payload.body ?? ""),
        tag: payload.tag ? String(payload.tag) : undefined,
        urgent: Boolean(payload.urgent),
      });
      break;
    }
    case "sms_notification": {
      const url = process.env.SMS_WEBHOOK_URL;
      if (!url) return;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      break;
    }
    case "print_job": {
      const { isLegacyPrintPushEnabled } = await import("@/lib/print-constants");
      if (!isLegacyPrintPushEnabled()) return;
      const agentUrl = process.env.PRINTER_AGENT_URL;
      if (!agentUrl) return;
      await fetch(`${agentUrl.replace(/\/$/, "")}/print`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.PRINTER_AGENT_SECRET
            ? { Authorization: `Bearer ${process.env.PRINTER_AGENT_SECRET}` }
            : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      break;
    }
    case "analytics": {
      const { recordPlatformEvent } = await import("@/platform/event-bus");
      await recordPlatformEvent(payload as Parameters<typeof recordPlatformEvent>[0]);
      break;
    }
    case "platform_event": {
      const { processPlatformEventJob } = await import("@/platform/event-bus");
      await processPlatformEventJob(payload as Parameters<typeof processPlatformEventJob>[0]);
      break;
    }
    case "recipe_deduct": {
      const { deductRecipeForOrder } = await import("@/lib/recipe-service");
      await deductRecipeForOrder(
        String(payload.restaurantId),
        payload.items as Array<{ menuItemId: string; quantity: number }>,
      );
      break;
    }
    default:
      logWarn("job-queue", "Unknown job type", { type });
  }
}

export async function processJobById(id: string) {
  if (!getForensicContext()) {
    return runWithWorkerForensicContext(`background-job:${id}`, () => processJobByIdInner(id));
  }
  return processJobByIdInner(id);
}

async function processJobByIdInner(id: string) {
  const job = await prisma.backgroundJob.findUnique({ where: { id } });
  if (!job || job.status === "COMPLETED" || job.status === "PROCESSING") return job;

  setForensicCorrelationId(job.id);
  setForensicTenant({ restaurantId: job.restaurantId });
  setForensicResource({ type: "BackgroundJob", id: job.id, label: job.type });

  await prisma.backgroundJob.update({
    where: { id },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });

  try {
    const payload = JSON.parse(job.payload) as Record<string, unknown>;
    await handleJob(job.type as JobType, payload);
    return await prisma.backgroundJob.update({
      where: { id },
      data: { status: "COMPLETED", processedAt: new Date(), error: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = job.attempts + 1 >= job.maxAttempts;
    await tryAppendPlatformAuditEvent({
      eventKind: AUDIT_EVENT_KIND.ERROR,
      severity: failed ? AUDIT_SEVERITY.ERROR : AUDIT_SEVERITY.WARN,
      category: AUDIT_CATEGORY.SYSTEM,
      action: failed ? AUDIT_ACTION.BACKGROUND_JOB_FAILED : AUDIT_ACTION.BACKGROUND_JOB_RETRY,
      outcome: "FAILED",
      correlationId: job.id,
      restaurantId: job.restaurantId,
      resourceType: "BackgroundJob",
      resourceId: job.id,
      resourceLabel: job.type,
      error: err,
      metadata: { jobType: job.type, attempt: job.attempts + 1, failed },
    });
    return await prisma.backgroundJob.update({
      where: { id },
      data: {
        status: failed ? ("FAILED" as JobStatus) : ("PENDING" as JobStatus),
        error: message,
        processedAt: failed ? new Date() : null,
      },
    });
  }
}

export async function processPendingJobs(limit = 20) {
  const pending = await prisma.backgroundJob.findMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  let processed = 0;
  for (const job of pending) {
    await processJobById(job.id);
    processed += 1;
  }

  if (processed > 0) {
    logInfo("job-queue", "Processed pending jobs", { processed });
  }
  return processed;
}
