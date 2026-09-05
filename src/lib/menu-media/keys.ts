import { randomBytes } from "node:crypto";
import {
  MENU_IMPORT_SOURCE_KEY_RE,
  MENU_MEDIA_KEY_PREFIX,
  MENU_MEDIA_KEY_RE,
} from "@/lib/menu-media/constants";

function sanitizeIdentity(value: string, fallback?: string) {
  const cleaned = String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (cleaned) return cleaned;
  if (fallback) return fallback;
  throw new Error("Invalid menu media identity");
}

export function createMenuMediaStorageKey(params: {
  tenantId?: string | null;
  restaurantId: string;
  menuItemId: string;
}) {
  const tenant = sanitizeIdentity(params.tenantId ?? "", "standalone");
  const restaurantId = sanitizeIdentity(params.restaurantId);
  const menuItemId = sanitizeIdentity(params.menuItemId);
  const objectId = randomBytes(16).toString("hex");
  return `tenant/${tenant}/restaurant/${restaurantId}/menu/${menuItemId}/${objectId}.webp`;
}

export function isManagedMenuMediaKey(key: string | null | undefined): key is string {
  if (!key || typeof key !== "string") return false;
  if (key.includes("\0") || key.includes("\\") || key.includes("..")) return false;
  if (key.startsWith("/") || key.includes("//")) return false;
  return MENU_MEDIA_KEY_RE.test(key);
}

export function assertManagedMenuMediaKey(key: string) {
  if (!isManagedMenuMediaKey(key)) {
    throw new Error("Invalid menu media storage key");
  }
  return key;
}

export function isManagedMenuImportSourceKey(key: string | null | undefined): key is string {
  if (!key || typeof key !== "string") return false;
  if (key.includes("\0") || key.includes("\\") || key.includes("..")) return false;
  if (key.startsWith("/") || key.includes("//")) return false;
  return MENU_IMPORT_SOURCE_KEY_RE.test(key);
}

export function isStoredMenuObjectKey(key: string | null | undefined): key is string {
  return isManagedMenuMediaKey(key) || isManagedMenuImportSourceKey(key);
}

export function assertStoredMenuObjectKey(key: string) {
  if (!isStoredMenuObjectKey(key)) {
    throw new Error("Invalid menu media storage key");
  }
  return key;
}

export function publicMenuMediaUrl(menuItemId: string, revision: number) {
  return `/api/menu/media/${menuItemId}?v=${revision}`;
}

export function isManagedMenuMediaUrl(url: string | null | undefined, menuItemId: string) {
  if (!url) return false;
  try {
    const pathOnly = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
    return pathOnly === `/api/menu/media/${menuItemId}`;
  } catch {
    return false;
  }
}

export function menuMediaListPrefix() {
  return MENU_MEDIA_KEY_PREFIX;
}

export function omitMenuItemStorageKey<T extends { imageStorageKey?: string | null }>(
  item: T,
): Omit<T, "imageStorageKey"> {
  const rest = { ...item };
  delete rest.imageStorageKey;
  return rest;
}
