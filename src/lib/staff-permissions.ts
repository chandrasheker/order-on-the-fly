import type { Role } from "@/generated/prisma/client";

export type StaffTab =
  | "active"
  | "pending"
  | "completed"
  | "revenue"
  | "overdue"
  | "missed"
  | "alerts";

export type OrderAction =
  | "prepare-item"
  | "ready-item"
  | "serve-item"
  | "reject-item"
  | "serve-all"
  | "mark-paid";

const TAB_ACCESS: Record<Role, StaffTab[]> = {
  OWNER: ["active", "pending", "completed", "revenue", "overdue", "missed", "alerts"],
  MANAGER: ["active", "pending", "completed", "revenue", "overdue", "missed", "alerts"],
  COOK: ["active", "completed", "overdue", "missed", "alerts"],
  SERVER: ["active", "pending", "overdue", "alerts"],
};

const ACTION_ACCESS: Record<Role, OrderAction[]> = {
  OWNER: [
    "prepare-item",
    "ready-item",
    "serve-item",
    "reject-item",
    "serve-all",
    "mark-paid",
  ],
  MANAGER: [
    "prepare-item",
    "ready-item",
    "serve-item",
    "reject-item",
    "serve-all",
    "mark-paid",
  ],
  COOK: ["prepare-item", "ready-item", "reject-item"],
  SERVER: ["serve-item", "reject-item", "serve-all", "mark-paid"],
};

export function canAccessTab(role: Role, tab: StaffTab) {
  return TAB_ACCESS[role].includes(tab);
}

export function getTabsForRole(role: Role) {
  return TAB_ACCESS[role];
}

export function canPerformOrderAction(role: Role, action: OrderAction) {
  return ACTION_ACCESS[role].includes(action);
}

export function canAccessAdminMenu(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

export function canManageTableOrdering(role: Role) {
  return role === "OWNER" || role === "MANAGER" || role === "SERVER";
}

export function canAccessReports(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

export function getDefaultTabForRole(role: Role): StaffTab {
  return "active";
}

export function slotKeyForRole(role: Role, index: number) {
  const prefix =
    role === "OWNER"
      ? "owner"
      : role === "MANAGER"
        ? "manager"
        : role === "COOK"
          ? "cook"
          : "server";
  return `${prefix}${index}`;
}

export function roleForSlotKey(slotKey: string): Role | null {
  if (slotKey.startsWith("owner")) return "OWNER";
  if (slotKey.startsWith("manager")) return "MANAGER";
  if (slotKey.startsWith("cook")) return "COOK";
  if (slotKey.startsWith("server")) return "SERVER";
  return null;
}

export const DEFAULT_SLOT_COUNTS = {
  owner: 1,
  manager: 2,
  cook: 3,
  server: 4,
} as const;
