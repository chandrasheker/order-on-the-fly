export type TableFloorState =
  | "available"
  | "seated"
  | "ordering"
  | "kitchen"
  | "ready"
  | "eating"
  | "payment"
  | "overdue";

export const FLOOR_STATE_LABELS: Record<
  TableFloorState,
  { label: string; description: string }
> = {
  available: { label: "Available", description: "Empty — ready for guests" },
  seated: { label: "Seated", description: "Guests seated, no order yet" },
  ordering: { label: "Ordering", description: "Cart has items or guests are placing an order" },
  kitchen: { label: "Kitchen", description: "Items cooking on the line" },
  ready: { label: "Ready", description: "Food ready — waiting to be served" },
  eating: { label: "Eating", description: "Food served, guests dining" },
  payment: { label: "Payment", description: "Consolidated bill — awaiting payment" },
  overdue: { label: "Overdue", description: "Kitchen item past prep deadline" },
};

/** Shared chip/tile colors for floor plan and table-ordering. Keep these identical. */
export const FLOOR_STATE_STYLES: Record<string, string> = {
  available: "border-emerald-500/55 bg-emerald-500/20 text-emerald-200",
  seated: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  ordering: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  kitchen: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  ready: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  eating: "border-orange-500/60 bg-orange-500/20 text-orange-200",
  payment: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  overdue:
    "border-red-600 bg-red-600/45 text-red-50 animate-pulse shadow-[0_0_14px_rgba(220,38,38,0.65)]",
};

/** Owner-disabled QR — not a floor state, and never the eating green. */
export const TABLE_CLOSED_STYLE = "border-zinc-700/70 bg-zinc-950/55 text-zinc-500";

export const FLOOR_CHANGED_EVENT = "tabletap:floor-changed";

export function notifyFloorChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FLOOR_CHANGED_EVENT));
}
