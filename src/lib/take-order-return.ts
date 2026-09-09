export function takeOrderPath(fromPathname?: string | null) {
  const from = safeStaffReturnPath(fromPathname);
  return `/staff/take-order?from=${encodeURIComponent(from)}`;
}

export function safeStaffReturnPath(from: string | null | undefined) {
  if (!from || !from.startsWith("/") || from.startsWith("//") || from.startsWith("/staff/take-order")) {
    return "/staff/dashboard";
  }
  return from;
}
