import type { Role } from "@/generated/prisma/client";
import { roleForSlotKey, slotKeyForRole } from "@/lib/staff-permissions";

export interface SlotCounts {
  owner: number;
  manager: number;
  cook: number;
  server: number;
}

export interface StaffSlotDraft {
  slotKey: string;
  role: Role;
  name: string;
  email: string;
  password: string;
  userId?: string;
}

export function buildSlotKeys(counts: SlotCounts): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= counts.owner; i++) keys.push(slotKeyForRole("OWNER", i));
  for (let i = 1; i <= counts.manager; i++) keys.push(slotKeyForRole("MANAGER", i));
  for (let i = 1; i <= counts.cook; i++) keys.push(slotKeyForRole("COOK", i));
  for (let i = 1; i <= counts.server; i++) keys.push(slotKeyForRole("SERVER", i));
  return keys;
}

export function slotCountsFromRestaurant(restaurant: {
  ownerSlots: number;
  managerSlots: number;
  cookSlots: number;
  serverSlots: number;
}): SlotCounts {
  return {
    owner: restaurant.ownerSlots,
    manager: restaurant.managerSlots,
    cook: restaurant.cookSlots,
    server: restaurant.serverSlots,
  };
}

export function defaultEmailForSlot(restaurantSlug: string, slotKey: string) {
  return `${slotKey}@${restaurantSlug}.com`;
}

export function defaultNameForSlot(slotKey: string) {
  const role = roleForSlotKey(slotKey);
  const num = slotKey.replace(/\D/g, "") || "1";
  switch (role) {
    case "OWNER":
      return `Owner ${num}`;
    case "MANAGER":
      return `Manager ${num}`;
    case "COOK":
      return `Cook ${num}`;
    case "SERVER":
      return `Server ${num}`;
    default:
      return slotKey;
  }
}

export function generatePassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function slotsToCsv(
  rows: Array<{
    restaurant: string;
    slotKey: string;
    role: string;
    name: string;
    email: string;
    password: string;
  }>
) {
  const header = ["Restaurant", "Slot", "Role", "Name", "Username", "Password"].join(",");
  const lines = rows.map((r) =>
    [
      `"${r.restaurant.replace(/"/g, '""')}"`,
      r.slotKey,
      r.role,
      `"${r.name.replace(/"/g, '""')}"`,
      r.email,
      r.password,
    ].join(",")
  );
  return [header, ...lines].join("\n");
}
