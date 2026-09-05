import {
  COMMAND_CENTER_THRESHOLDS,
  type BinaryHealthLevel,
  type KitchenLoadLevel,
  type PrintingHealthLevel,
  type ServiceLoadLevel,
} from "@/platform/command-center/thresholds";

export type ClassifiedStatus<T extends string> = {
  level: T;
  reasons: string[];
  components: Record<string, number | boolean | string | null>;
};

export function classifyKitchenLoad(input: {
  kitchenPaused: boolean;
  overdueCount: number;
  backlogCount: number;
  oldestOverdueMs?: number | null;
}): ClassifiedStatus<KitchenLoadLevel> {
  const t = COMMAND_CENTER_THRESHOLDS.kitchen;
  const reasons: string[] = [];
  const components = {
    kitchenPaused: input.kitchenPaused,
    overdueCount: input.overdueCount,
    backlogCount: input.backlogCount,
    oldestOverdueMs: input.oldestOverdueMs ?? null,
  };

  if (input.kitchenPaused) reasons.push("Kitchen is paused");
  if (input.overdueCount >= t.overdueOverwhelmed) {
    reasons.push(`${input.overdueCount} overdue PENDING/PREPARING items`);
  } else if (input.overdueCount >= t.overdueHigh) {
    reasons.push(`${input.overdueCount} overdue items`);
  } else if (input.overdueCount >= t.overdueBusy) {
    reasons.push(`${input.overdueCount} overdue item${input.overdueCount === 1 ? "" : "s"}`);
  }
  if (input.backlogCount >= t.backlogOverwhelmed) {
    reasons.push(`${input.backlogCount} PENDING/PREPARING backlog`);
  } else if (input.backlogCount >= t.backlogHigh) {
    reasons.push(`${input.backlogCount} item backlog`);
  } else if (input.backlogCount >= t.backlogBusy) {
    reasons.push(`${input.backlogCount} items in kitchen`);
  }

  let level: KitchenLoadLevel = "NORMAL";
  if (
    input.kitchenPaused ||
    input.overdueCount >= t.overdueOverwhelmed ||
    input.backlogCount >= t.backlogOverwhelmed
  ) {
    level = "OVERWHELMED";
  } else if (input.overdueCount >= t.overdueHigh || input.backlogCount >= t.backlogHigh) {
    level = "HIGH";
  } else if (input.overdueCount >= t.overdueBusy || input.backlogCount >= t.backlogBusy) {
    level = "BUSY";
  }

  if (level === "NORMAL") reasons.push("No kitchen backlog pressure");
  return { level, reasons, components };
}

export function classifyServiceLoad(input: {
  readyWaiting: number;
  unresolvedRequests: number;
  activeTables: number;
  serverSessions: number;
  avgAckMs?: number | null;
}): ClassifiedStatus<ServiceLoadLevel> {
  const t = COMMAND_CENTER_THRESHOLDS.service;
  const reasons: string[] = [];
  const unattended =
    input.activeTables > 0 &&
    input.serverSessions === 0 &&
    input.readyWaiting >= t.unattendedReadyHigh;
  const components = {
    readyWaiting: input.readyWaiting,
    unresolvedRequests: input.unresolvedRequests,
    activeTables: input.activeTables,
    serverSessions: input.serverSessions,
    avgAckMs: input.avgAckMs ?? null,
    unattended,
  };

  if (input.readyWaiting >= t.readyHigh) reasons.push(`${input.readyWaiting} READY items waiting`);
  else if (input.readyWaiting >= t.readyBusy) reasons.push(`${input.readyWaiting} READY items waiting`);
  if (input.unresolvedRequests >= t.unresolvedHigh) {
    reasons.push(`${input.unresolvedRequests} unresolved guest requests`);
  } else if (input.unresolvedRequests >= t.unresolvedBusy) {
    reasons.push(`${input.unresolvedRequests} unresolved guest requests`);
  }
  if (unattended) reasons.push("Active tables with no server session and READY items waiting");
  if (input.avgAckMs != null && input.avgAckMs > t.ackMsBusy) {
    reasons.push(`Average guest-request acknowledgement ${Math.round(input.avgAckMs / 1000)}s`);
  }

  let level: ServiceLoadLevel = "NORMAL";
  if (input.readyWaiting >= t.readyHigh || input.unresolvedRequests >= t.unresolvedHigh || unattended) {
    level = "HIGH";
  } else if (
    input.readyWaiting >= t.readyBusy ||
    input.unresolvedRequests >= t.unresolvedBusy ||
    (input.avgAckMs != null && input.avgAckMs > t.ackMsBusy)
  ) {
    level = "BUSY";
  }

  if (level === "NORMAL") reasons.push("Service load is within normal bounds");
  return { level, reasons, components };
}

export function classifyMoneyHealth(input: {
  pendingGatewayAttempts: number;
  failedGatewayAttempts: number;
  refundPending: number;
  refundFailures: number;
  reconciliationVariancePaise: number;
  cashVariancePaise: number;
}): ClassifiedStatus<BinaryHealthLevel> {
  const reasons: string[] = [];
  if (input.pendingGatewayAttempts > 0) {
    reasons.push(`${input.pendingGatewayAttempts} pending gateway attempt${input.pendingGatewayAttempts === 1 ? "" : "s"}`);
  }
  if (input.failedGatewayAttempts > 0) {
    reasons.push(`${input.failedGatewayAttempts} failed gateway attempt${input.failedGatewayAttempts === 1 ? "" : "s"}`);
  }
  if (input.refundPending > 0) reasons.push(`${input.refundPending} refund${input.refundPending === 1 ? "" : "s"} pending`);
  if (input.refundFailures > 0) reasons.push(`${input.refundFailures} refund failure${input.refundFailures === 1 ? "" : "s"}`);
  if (input.reconciliationVariancePaise !== 0) {
    reasons.push(`Reconciliation variance ${input.reconciliationVariancePaise} paise`);
  }
  if (input.cashVariancePaise !== 0) {
    reasons.push(`Cash variance ${input.cashVariancePaise} paise`);
  }
  return {
    level: reasons.length ? "ATTENTION" : "HEALTHY",
    reasons: reasons.length ? reasons : ["No payment, refund, or reconciliation warnings"],
    components: input,
  };
}

export function classifyPrintingHealth(input: {
  enabledAgentCount: number;
  onlineAgentCount: number;
  lastSeenAt: string | null;
  lastSeenAgoMs: number | null;
  failures: number;
  ambiguous: number;
  queueDepth: number;
  lastError: string | null;
}): ClassifiedStatus<PrintingHealthLevel> {
  const reasons: string[] = [];
  let level: PrintingHealthLevel = "HEALTHY";
  if (input.enabledAgentCount > 0 && input.onlineAgentCount === 0) {
    level = "OFFLINE";
    reasons.push(
      input.lastSeenAt
        ? `Printer agent last seen ${formatAgo(input.lastSeenAgoMs)}`
        : "Enabled printer agent has never been seen",
    );
  } else if (input.failures > 0 || input.ambiguous > 0 || input.lastError) {
    level = "DEGRADED";
    if (input.failures > 0) reasons.push(`${input.failures} confirmed print failure${input.failures === 1 ? "" : "s"}`);
    if (input.ambiguous > 0) reasons.push(`${input.ambiguous} AMBIGUOUS print job${input.ambiguous === 1 ? "" : "s"}`);
    if (input.lastError) reasons.push(input.lastError);
  }
  if (input.queueDepth > 0 && level === "HEALTHY") {
    reasons.push(`${input.queueDepth} job${input.queueDepth === 1 ? "" : "s"} in queue`);
  }
  if (!reasons.length) reasons.push("No print failures or stale agents");
  return {
    level,
    reasons,
    components: input,
  };
}

export function classifyReliability(input: {
  requestFailed: number;
  http5xx: number;
  uniqueFingerprints: number;
  securityDenials: number;
  jobFailures: number;
  providerFailures: number;
  printFailures: number;
}): ClassifiedStatus<BinaryHealthLevel> {
  const t = COMMAND_CENTER_THRESHOLDS.reliability;
  const reasons: string[] = [];
  if (input.requestFailed >= t.requestFailedAttention) {
    reasons.push(`${input.requestFailed} REQUEST_FAILED`);
  }
  if (input.http5xx >= t.fiveXxAttention) reasons.push(`${input.http5xx} 5xx requests`);
  if (input.uniqueFingerprints >= t.uniqueFingerprintsAttention) {
    reasons.push(`${input.uniqueFingerprints} unique error fingerprints`);
  }
  if (input.securityDenials >= t.securityDenialsAttention) {
    reasons.push(`${input.securityDenials} security denial${input.securityDenials === 1 ? "" : "s"}`);
  }
  if (input.jobFailures > 0) reasons.push(`${input.jobFailures} background-job failure${input.jobFailures === 1 ? "" : "s"}`);
  if (input.providerFailures > 0) reasons.push(`${input.providerFailures} payment-provider failure${input.providerFailures === 1 ? "" : "s"}`);
  if (input.printFailures > 0) reasons.push(`${input.printFailures} print failure event${input.printFailures === 1 ? "" : "s"}`);
  return {
    level: reasons.length ? "ATTENTION" : "HEALTHY",
    reasons: reasons.length ? reasons : ["No reliability warnings in this period"],
    components: input,
  };
}

export function slaLabel(input: {
  missedCount: number;
  sampleCount: number;
  onTimePercent: number | null;
  requireNeverMissedSample?: boolean;
}) {
  const minSample = COMMAND_CENTER_THRESHOLDS.slaNeverMissedMinSample;
  if (input.sampleCount <= 0) {
    return { text: "No eligible SLA sample", neverMissed: false };
  }
  if (input.missedCount === 0 && input.sampleCount >= minSample) {
    return { text: "Never missed SLA", neverMissed: true };
  }
  if (input.missedCount === 0) {
    return {
      text: `100% so far — ${input.sampleCount} eligible item${input.sampleCount === 1 ? "" : "s"}`,
      neverMissed: false,
    };
  }
  const pct = input.onTimePercent == null ? "—" : `${input.onTimePercent.toFixed(1)}%`;
  return { text: `${pct} on-time · ${input.sampleCount} eligible`, neverMissed: false };
}

export function attentionReasons(input: {
  kitchen: ClassifiedStatus<KitchenLoadLevel>;
  service: ClassifiedStatus<ServiceLoadLevel>;
  payments: ClassifiedStatus<BinaryHealthLevel>;
  printing: ClassifiedStatus<PrintingHealthLevel>;
  reliability: ClassifiedStatus<BinaryHealthLevel>;
}) {
  const reasons: Array<{ subsystem: string; level: string; detail: string }> = [];
  if (input.kitchen.level === "HIGH" || input.kitchen.level === "OVERWHELMED") {
    reasons.push({ subsystem: "Kitchen", level: input.kitchen.level, detail: input.kitchen.reasons[0] ?? input.kitchen.level });
  }
  if (input.service.level === "HIGH") {
    reasons.push({ subsystem: "Service", level: input.service.level, detail: input.service.reasons[0] ?? input.service.level });
  }
  if (input.payments.level === "ATTENTION") {
    reasons.push({ subsystem: "Payments", level: input.payments.level, detail: input.payments.reasons[0] ?? input.payments.level });
  }
  if (input.printing.level === "DEGRADED" || input.printing.level === "OFFLINE") {
    reasons.push({ subsystem: "Printing", level: input.printing.level, detail: input.printing.reasons[0] ?? input.printing.level });
  }
  if (input.reliability.level === "ATTENTION") {
    reasons.push({ subsystem: "Reliability", level: input.reliability.level, detail: input.reliability.reasons[0] ?? input.reliability.level });
  }
  return reasons;
}

function formatAgo(ms: number | null) {
  if (ms == null) return "never";
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function formatDurationMs(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
