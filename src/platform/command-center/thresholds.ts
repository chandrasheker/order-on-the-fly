/**
 * Single source of truth for M5 operational classifications.
 * Transparent, rule-based, no opaque scores.
 */
export const COMMAND_CENTER_THRESHOLDS = {
  slaNeverMissedMinSample: 100,

  kitchen: {
    overdueBusy: 1,
    overdueHigh: 4,
    overdueOverwhelmed: 8,
    backlogBusy: 6,
    backlogHigh: 12,
    backlogOverwhelmed: 20,
  },

  service: {
    readyBusy: 3,
    readyHigh: 8,
    unresolvedBusy: 2,
    unresolvedHigh: 5,
    ackMsBusy: 180_000,
    unattendedReadyHigh: 2,
  },

  reliability: {
    fiveXxAttention: 1,
    uniqueFingerprintsAttention: 3,
    requestFailedAttention: 1,
    securityDenialsAttention: 1,
  },
} as const;

export type KitchenLoadLevel = "NORMAL" | "BUSY" | "HIGH" | "OVERWHELMED";
export type ServiceLoadLevel = "NORMAL" | "BUSY" | "HIGH";
export type BinaryHealthLevel = "HEALTHY" | "ATTENTION";
export type PrintingHealthLevel = "HEALTHY" | "DEGRADED" | "OFFLINE" | "NOT_CONFIGURED";
