import type { OrderChannel, TableKind } from "@/generated/prisma/client";

export const SERVICE_TABLE_NUMBERS = {
  TAKEAWAY: 901,
  DELIVERY: 902,
  SWIGGY: 903,
  ZOMATO: 904,
} as const;

export const SERVICE_TABLE_DEFS: Array<{
  number: number;
  kind: TableKind;
  serviceLabel: string;
  channel: OrderChannel;
}> = [
  { number: 901, kind: "TAKEAWAY", serviceLabel: "Takeaway", channel: "TAKEAWAY" },
  { number: 902, kind: "DELIVERY", serviceLabel: "Delivery", channel: "DELIVERY" },
  { number: 903, kind: "AGGREGATOR", serviceLabel: "Swiggy", channel: "SWIGGY" },
  { number: 904, kind: "AGGREGATOR", serviceLabel: "Zomato", channel: "ZOMATO" },
];

export function channelForTableKind(
  kind: TableKind,
  serviceLabel?: string | null
): OrderChannel {
  if (kind === "TAKEAWAY") return "TAKEAWAY";
  if (kind === "DELIVERY") return "DELIVERY";
  if (kind === "AGGREGATOR") {
    if (serviceLabel?.toLowerCase().includes("zomato")) return "ZOMATO";
    return "SWIGGY";
  }
  return "DINE_IN";
}

export function isServiceTable(kind: TableKind) {
  return kind !== "DINE_IN";
}

export function formatOrderLocation(input: {
  orderChannel?: OrderChannel | null;
  tableNumber: number;
  tableKind?: TableKind | null;
  serviceLabel?: string | null;
}) {
  const channel = input.orderChannel ?? channelForTableKind(input.tableKind ?? "DINE_IN", input.serviceLabel);
  switch (channel) {
    case "TAKEAWAY":
      return "Takeaway";
    case "DELIVERY":
      return "Delivery";
    case "SWIGGY":
      return "Swiggy";
    case "ZOMATO":
      return "Zomato";
    case "WALK_IN":
      return `Walk-in · T${input.tableNumber}`;
    default:
      return `Table ${input.tableNumber}`;
  }
}

export function channelBadgeClass(channel: OrderChannel) {
  switch (channel) {
    case "TAKEAWAY":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "DELIVERY":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "SWIGGY":
      return "bg-orange-500/15 text-orange-300 border-orange-500/30";
    case "ZOMATO":
      return "bg-red-500/15 text-red-300 border-red-500/30";
    case "WALK_IN":
      return "bg-violet-500/15 text-violet-300 border-violet-500/30";
    default:
      return "bg-white/10 text-zinc-300 border-white/10";
  }
}
