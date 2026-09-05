import type { Prisma } from "@/generated/prisma/client";
import { AUDIT_ACTION, AUDIT_CATEGORY, AUDIT_EVENT_KIND } from "@/platform/forensics/constants";

export const LOG_PRESETS = [
  "all",
  "access",
  "activity",
  "auth",
  "security",
  "errors",
  "payments",
  "printing",
  "config",
  "system",
] as const;

export type LogPreset = (typeof LOG_PRESETS)[number];

const ERROR_ACTIONS = [
  AUDIT_ACTION.REQUEST_FAILED,
  AUDIT_ACTION.BACKGROUND_JOB_FAILED,
  AUDIT_ACTION.BACKGROUND_JOB_RETRY,
  AUDIT_ACTION.PAYMENT_PROVIDER_API_FAILED,
  AUDIT_ACTION.RAZORPAY_REFUND_API_FAILED,
  AUDIT_ACTION.WEBHOOK_PROCESSING_FAILED,
  AUDIT_ACTION.PRINT_DELIVERY_FAILED,
  AUDIT_ACTION.PRINT_JOB_FAILED,
  AUDIT_ACTION.DATABASE_OPERATION_FAILED,
  AUDIT_ACTION.FORENSIC_AUDIT_WRITE_FAILED,
] as const;

export function isLogPreset(value: string | null | undefined): value is LogPreset {
  return LOG_PRESETS.includes((value ?? "") as LogPreset);
}

export function presetWhere(preset: LogPreset | null | undefined): Prisma.PlatformAuditEventWhereInput | null {
  switch (preset) {
    case "access":
      return { eventKind: AUDIT_EVENT_KIND.REQUEST };
    case "activity":
      return { eventKind: AUDIT_EVENT_KIND.ACTION };
    case "auth":
      return { category: AUDIT_CATEGORY.AUTH };
    case "security":
      return {
        OR: [{ eventKind: AUDIT_EVENT_KIND.SECURITY }, { category: AUDIT_CATEGORY.SECURITY }],
      };
    case "errors":
      return {
        OR: [
          { eventKind: AUDIT_EVENT_KIND.ERROR },
          { action: { in: [...ERROR_ACTIONS] } },
          { AND: [{ eventKind: AUDIT_EVENT_KIND.REQUEST }, { httpStatus: { gte: 500 } }] },
        ],
      };
    case "payments":
      return { category: AUDIT_CATEGORY.MONEY };
    case "printing":
      return { category: AUDIT_CATEGORY.PRINTING };
    case "config":
      return { category: AUDIT_CATEGORY.CONFIG };
    case "system":
      return {
        OR: [
          { category: AUDIT_CATEGORY.SYSTEM },
          { source: { in: ["WORKER", "SYSTEM"] } },
        ],
      };
    default:
      return null;
  }
}

export function extraLogFilterWhere(input: {
  failedOnly?: boolean;
  ambiguousOnly?: boolean;
}): Prisma.PlatformAuditEventWhereInput | null {
  const and: Prisma.PlatformAuditEventWhereInput[] = [];
  if (input.failedOnly) {
    and.push({
      OR: [{ outcome: "FAILED" }, { action: { contains: "FAIL" } }, { httpStatus: { gte: 400 } }],
    });
  }
  if (input.ambiguousOnly) {
    and.push({
      OR: [
        { action: AUDIT_ACTION.PRINT_JOB_AMBIGUOUS },
        { errorCode: "AMBIGUOUS_DELIVERY" },
      ],
    });
  }
  if (!and.length) return null;
  return and.length === 1 ? and[0]! : { AND: and };
}
