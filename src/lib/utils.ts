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

export function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
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
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
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
