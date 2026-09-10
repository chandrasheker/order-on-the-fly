export type TakeOrderMode = "walkin" | "takeaway" | "delivery";

export function takeOrderPath(fromPathname?: string | null, mode?: TakeOrderMode) {
  const from = safeStaffReturnPath(fromPathname);
  const params = new URLSearchParams({ from });
  if (mode) params.set("mode", mode);
  return `/staff/take-order?${params.toString()}`;
}

export function parseTakeOrderMode(value: string | null | undefined): TakeOrderMode | undefined {
  if (value === "walkin" || value === "takeaway" || value === "delivery") return value;
  return undefined;
}

export function safeStaffReturnPath(from: string | null | undefined) {
  if (!from || !from.startsWith("/") || from.startsWith("//") || from.startsWith("/staff/take-order")) {
    return "/staff/dashboard";
  }
  return from;
}
