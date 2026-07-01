import type { OrderItemStatus, OrderStatus } from "@/generated/prisma/client";

/** Canonical lifecycle labels (maps to existing OrderStatus / OrderItemStatus enums). */
export const ORDER_LIFECYCLE = {
  CREATED: "PENDING",
  CONFIRMED: "PENDING",
  COOKING: "PREPARING",
  READY: "READY",
  SERVED: "SERVED",
  PAID: "PAID",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;

export type OrderItemTransition =
  | "start-preparing"
  | "mark-ready"
  | "mark-served"
  | "mark-unavailable";

const ORDER_ITEM_TRANSITIONS: Record<OrderItemStatus, Partial<Record<OrderItemTransition, OrderItemStatus>>> = {
  PENDING: {
    "start-preparing": "PREPARING",
    "mark-ready": "READY",
    "mark-unavailable": "UNAVAILABLE",
  },
  PREPARING: {
    "mark-ready": "READY",
    "mark-unavailable": "UNAVAILABLE",
  },
  READY: {
    "mark-served": "SERVED",
    "mark-unavailable": "UNAVAILABLE",
  },
  SERVED: {},
  UNAVAILABLE: {},
};

export class InvalidOrderTransitionError extends Error {
  constructor(
    message: string,
    public from: string,
    public transition: string,
  ) {
    super(message);
    this.name = "InvalidOrderTransitionError";
  }
}

export function canTransitionOrderItem(from: OrderItemStatus, transition: OrderItemTransition): boolean {
  return Boolean(ORDER_ITEM_TRANSITIONS[from]?.[transition]);
}

export function nextOrderItemStatus(
  from: OrderItemStatus,
  transition: OrderItemTransition,
): OrderItemStatus {
  const next = ORDER_ITEM_TRANSITIONS[from]?.[transition];
  if (!next) {
    throw new InvalidOrderTransitionError(
      `Invalid transition ${transition} from ${from}`,
      from,
      transition,
    );
  }
  return next;
}

/** Derive aggregate order status from open item statuses. */
export function deriveOrderStatus(
  itemStatuses: OrderItemStatus[],
): Exclude<OrderStatus, "CANCELLED"> {
  const open = itemStatuses.filter((s) => s !== "SERVED" && s !== "UNAVAILABLE");
  if (open.length === 0) return "SERVED";

  if (open.some((s) => s === "READY")) return "READY";
  if (open.some((s) => s === "PREPARING")) return "PREPARING";
  return "PENDING";
}

/** Order-level paid/closed guards. */
export function canMarkOrderPaid(status: OrderStatus, paidAt: Date | null): boolean {
  return status === "SERVED" && !paidAt;
}

export function isOrderClosed(status: OrderStatus, paidAt: Date | null): boolean {
  return status === "SERVED" && Boolean(paidAt);
}

/** Document forbidden transitions for tests / docs. */
export const FORBIDDEN_ORDER_TRANSITIONS = [
  "READY → PENDING",
  "READY → PREPARING",
  "SERVED → PREPARING",
  "PAID → COOKING",
  "CLOSED → CREATED",
] as const;
