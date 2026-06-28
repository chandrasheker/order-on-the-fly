import { format } from "date-fns";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function todayDateString() {
  return format(new Date(), "yyyy-MM-dd");
}

export function tomorrowDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return format(d, "yyyy-MM-dd");
}

export function generateRewardCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "VAR-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function getBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "https://varanasihotel.duckdns.org";
  return raw.replace(/\/+$/, "");
}

export function getTableOrderUrl(slug: string, qrToken: string) {
  return `${getBaseUrl()}/order/${slug}/${qrToken}`;
}

export function getPrepTimeLabel(minutes: number) {
  if (minutes <= 1) return "~1 min";
  if (minutes <= 5) return `~${minutes} mins`;
  if (minutes <= 15) return `~${minutes} mins`;
  return `~${minutes} mins`;
}

export function getStatusColor(status: string, isOverdue?: boolean) {
  if (isOverdue) return "bg-red-500/15 text-red-400 border-red-500/30";
  switch (status) {
    case "PENDING":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "PREPARING":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "READY":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "SERVED":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    case "UNAVAILABLE":
      return "bg-zinc-500/15 text-zinc-500 border-zinc-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

export function isOrderItemOpen(status: string) {
  return status !== "SERVED" && status !== "UNAVAILABLE";
}

/** Only served items count toward revenue totals. */
export function countsTowardRevenue(status: string) {
  return status === "SERVED";
}

/** Billable order total — excludes out-of-stock items; includes items still preparing. */
export function countsTowardBillableTotal(status: string) {
  return status !== "UNAVAILABLE";
}

export function orderItemLineTotal(item: {
  unitPrice: number;
  quantity: number;
  status: string;
}) {
  return countsTowardRevenue(item.status) ? item.unitPrice * item.quantity : 0;
}

export function orderItemBillableTotal(item: {
  unitPrice: number;
  quantity: number;
  status: string;
}) {
  return countsTowardBillableTotal(item.status) ? item.unitPrice * item.quantity : 0;
}

export function sumOrderRevenue(
  items: Array<{ unitPrice: number; quantity: number; status: string }>
) {
  return items.reduce((sum, item) => sum + orderItemLineTotal(item), 0);
}

/** Revenue counts only when order is marked paid. */
export function sumPaidOrderRevenue(
  order: { paidAt?: Date | string | null },
  items: Array<{ unitPrice: number; quantity: number; status: string }>
) {
  if (!order.paidAt) return 0;
  return sumOrderRevenue(items);
}

export function sumBillableTotal(
  items: Array<{ unitPrice: number; quantity: number; status: string }>
) {
  return items.reduce((sum, item) => sum + orderItemBillableTotal(item), 0);
}

export function shouldShowCustomerOrder(items: Array<{ status: string }>) {
  return items.some((i) => i.status !== "SERVED");
}

export function getRemainingSeconds(expectedReadyAt: string | Date) {
  const target = new Date(expectedReadyAt).getTime();
  return Math.max(0, Math.floor((target - Date.now()) / 1000));
}

export function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type RewardTier = "NONE" | "TEA" | "BEVERAGE";

/** Tea from tea threshold up to (not including) beverage threshold; beverage at beverage threshold+. */
export function getRewardTier(
  total: number,
  teaThreshold: number,
  beverageThreshold: number
): RewardTier {
  if (total >= beverageThreshold) return "BEVERAGE";
  if (total >= teaThreshold) return "TEA";
  return "NONE";
}
