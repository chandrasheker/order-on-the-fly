import { prisma } from "@/lib/prisma";
import {
  MENU_IMPORT_ABANDONED_RETENTION_MS,
  MENU_IMPORT_TERMINAL_RETENTION_MS,
} from "@/lib/menu-import/constants";
import type { MenuImportSourceMeta } from "@/lib/menu-import/types";
import { isManagedMenuImportSourceKey } from "@/lib/menu-media/keys";
import { getMenuMediaStorage } from "@/lib/menu-media/storage";
import { logError } from "@/lib/logger";

export type MenuImportCleanupResult = {
  apply: boolean;
  listed: number;
  purgedImports: string[];
  deletedKeys: string[];
  failedKeys: string[];
  cancelledAbandoned: string[];
};

function keysFromMeta(json: string | null): string[] {
  if (!json) return [];
  try {
    const meta = JSON.parse(json) as MenuImportSourceMeta;
    return (meta.files ?? []).map((file) => file.key).filter(isManagedMenuImportSourceKey);
  } catch {
    return [];
  }
}

export async function runMenuImportCleanup(options?: {
  apply?: boolean;
  now?: Date;
  terminalRetentionMs?: number;
  abandonedRetentionMs?: number;
}): Promise<MenuImportCleanupResult> {
  const apply = Boolean(options?.apply);
  const now = options?.now ?? new Date();
  const terminalCutoff = new Date(now.getTime() - (options?.terminalRetentionMs ?? MENU_IMPORT_TERMINAL_RETENTION_MS));
  const abandonedCutoff = new Date(now.getTime() - (options?.abandonedRetentionMs ?? MENU_IMPORT_ABANDONED_RETENTION_MS));

  const rows = await prisma.menuImport.findMany({
    where: {
      OR: [
        { status: { in: ["APPLIED", "CANCELLED"] }, updatedAt: { lte: terminalCutoff } },
        {
          status: { in: ["UPLOADED", "PROCESSING", "READY_FOR_REVIEW", "FAILED", "APPLYING"] },
          createdAt: { lte: abandonedCutoff },
        },
      ],
    },
    select: { id: true, status: true, sourceMetaJson: true, createdAt: true, updatedAt: true },
  });

  const storage = getMenuMediaStorage();
  const purgedImports: string[] = [];
  const deletedKeys: string[] = [];
  const failedKeys: string[] = [];
  const cancelledAbandoned: string[] = [];

  for (const row of rows) {
    const keys = keysFromMeta(row.sourceMetaJson);
    const abandoned = !["APPLIED", "CANCELLED"].includes(row.status);
    if (apply) {
      for (const key of keys) {
        try {
          await storage.deleteObject(key);
          deletedKeys.push(key);
        } catch (error) {
          failedKeys.push(key);
          logError("menu-import", "Menu import source cleanup failed", {
            errorType: error instanceof Error ? error.name : "Error",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await prisma.menuImport.update({
        where: { id: row.id },
        data: {
          sourceMetaJson: JSON.stringify({ files: [] }),
          ...(abandoned ? { status: "CANCELLED", cancelledAt: now } : {}),
        },
      });
      purgedImports.push(row.id);
      if (abandoned) cancelledAbandoned.push(row.id);
    } else {
      purgedImports.push(row.id);
      deletedKeys.push(...keys);
      if (abandoned) cancelledAbandoned.push(row.id);
    }
  }

  return {
    apply,
    listed: rows.length,
    purgedImports,
    deletedKeys,
    failedKeys,
    cancelledAbandoned,
  };
}
