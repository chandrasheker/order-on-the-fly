import { renderJob } from "./render.mjs";
import { readJobState, writeJobState } from "./state.mjs";
import { submitToAdapter } from "./adapters.mjs";

export async function processClaimedJob(params) {
  const { job, mapping, stateDir, dryRun, adapter } = params;
  const existing = readJobState(stateDir, job.deliveryKey);
  if (existing?.status === "PRINTED") {
    return { outcome: "ACKED", printed: false, reason: "deduped" };
  }
  if (existing?.status === "IN_PROGRESS") {
    return {
      outcome: "AMBIGUOUS",
      errorCode: "AMBIGUOUS_DELIVERY",
      errorMessage: "Delivery state uncertain — verify paper output before reprinting",
      printed: false,
    };
  }
  if (!mapping) {
    return {
      outcome: "FAILED",
      errorCode: "PRINTER_NOT_CONFIGURED",
      errorMessage: `Printer not configured for "${job.target}"`,
      printed: false,
    };
  }

  writeJobState(stateDir, job.deliveryKey, { status: "IN_PROGRESS", jobId: job.id, target: job.target });
  const text = renderJob(job);
  const printed = await (adapter ?? submitToAdapter)({
    mapping,
    dryRun,
    stateDir,
    target: job.target,
    deliveryKey: job.deliveryKey,
    text,
  });
  if (!printed.ok) {
    writeJobState(stateDir, job.deliveryKey, {
      status: "FAILED",
      jobId: job.id,
      target: job.target,
      errorCode: printed.errorCode,
    });
    return {
      outcome: "FAILED",
      errorCode: printed.errorCode,
      errorMessage: printed.errorMessage,
      printed: false,
    };
  }
  writeJobState(stateDir, job.deliveryKey, {
    status: "PRINTED",
    jobId: job.id,
    target: job.target,
    spoolId: printed.spoolId ?? null,
  });
  return { outcome: "ACKED", printed: true };
}
