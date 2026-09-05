import { randomBytes } from "node:crypto";
import { isManagedMenuImportSourceKey } from "@/lib/menu-media/keys";

function sanitizeIdentity(value: string, fallback?: string) {
  const cleaned = String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (cleaned) return cleaned;
  if (fallback) return fallback;
  throw new Error("Invalid menu import identity");
}

const EXT_BY_TYPE: Record<string, "pdf" | "jpg" | "jpeg" | "png" | "webp"> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function createMenuImportSourceKey(params: {
  tenantId?: string | null;
  restaurantId: string;
  importId: string;
  index: number;
  contentType: string;
  originalName?: string;
}) {
  const tenant = sanitizeIdentity(params.tenantId ?? "", "standalone");
  const restaurantId = sanitizeIdentity(params.restaurantId);
  const importId = sanitizeIdentity(params.importId);
  const index = String(Math.max(0, Math.min(99, params.index))).padStart(2, "0");
  const objectId = randomBytes(16).toString("hex");
  const fromName = String(params.originalName ?? "")
    .toLowerCase()
    .split(".")
    .pop();
  const ext =
    EXT_BY_TYPE[params.contentType] ??
    (fromName === "jpeg" || fromName === "jpg" || fromName === "png" || fromName === "webp" || fromName === "pdf"
      ? fromName === "jpeg"
        ? "jpg"
        : fromName
      : "pdf");
  return `tenant/${tenant}/restaurant/${restaurantId}/menu-imports/${importId}/${index}-${objectId}.${ext}`;
}

export { isManagedMenuImportSourceKey };
