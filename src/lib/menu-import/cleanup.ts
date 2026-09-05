import { prisma } from "@/lib/prisma";
import {
  MENU_IMPORT_ABANDONED_RETENTION_MS,
  MENU_IMPORT_ORPHAN_GRACE_MS,
  MENU_IMPORT_TERMINAL_RETENTION_MS,
} from "@/lib/menu-import/constants";
import type { MenuImportSourceFileMeta, MenuImportSourceMeta } from "@/lib/menu-import/types";
import { isManagedMenuImportSourceKey, menuMediaListPrefix } from "@/lib/menu-media/keys";
import { getMenuMediaStorage } from "@/lib/menu-media/storage";
import { logError } from "@/lib/logger";

export type MenuImportCleanupResult = {
  apply: boolean;
  listed: number;
  purgedImports: string[];
  deletedKeys: string[];
  failedKeys: string[];
  cancelledAbandoned: string[];
  orphanedKeys: string[];
  deletedOrphans: string[];
  skippedRecentOrphans: number;
};

function filesFromMeta(json: string | null): MenuImportSourceFileMeta[] {
  if (!json) return [];
  try {
    const meta = JSON.parse(json) as MenuImportSourceMeta;
    return (meta.files ?? []).filter((file) => file && isManagedMenuImportSourceKey(file.key));
  } catch {
    return [];
  }
}

function keysFromMeta(json: string | null): string[] {
  return filesFromMeta(json).map((file) => file.key);
}

async function referencedImportSourceKeys() {
  const rows = await prisma.menuImport.findMany({
    select: { sourceMetaJson: true },
  });
  const referenced = new Set<string>();
  for (const row of rows) {
    for (const key of keysFromMeta(row.sourceMetaJson)) {
      referenced.add(key);
    }
  }
  return referenced;
}

export async function runMenuImportCleanup(options?: {
  apply?: boolean;
  now?: Date;
  terminalRetentionMs?: number;
  abandonedRetentionMs?: number;
  orphanGraceMs?: number;
}): Promise<MenuImportCleanupResult> {
  const apply = Boolean(options?.apply);
  const now = options?.now ?? new Date();
  const terminalCutoff = new Date(now.getTime() - (options?.terminalRetentionMs ?? MENU_IMPORT_TERMINAL_RETENTION_MS));
  const abandonedCutoff = new Date(now.getTime() - (options?.abandonedRetentionMs ?? MENU_IMPORT_ABANDONED_RETENTION_MS));
  const orphanCutoff = new Date(now.getTime() - (options?.orphanGraceMs ?? MENU_IMPORT_ORPHAN_GRACE_MS));

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
    const files = filesFromMeta(row.sourceMetaJson);
    const abandoned = !["APPLIED", "CANCELLED"].includes(row.status);
    if (apply) {
      const remaining: MenuImportSourceFileMeta[] = [];
      for (const file of files) {
        try {
          await storage.deleteObject(file.key);
          deletedKeys.push(file.key);
        } catch (error) {
          failedKeys.push(file.key);
          remaining.push(file);
          logError("menu-import", "Menu import source cleanup failed", {
            errorType: error instanceof Error ? error.name : "Error",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const remainingJson = JSON.stringify({ files: remaining });
      if (abandoned) {
        const moved = await prisma.menuImport.updateMany({
          where: {
            id: row.id,
            status: { in: ["UPLOADED", "PROCESSING", "READY_FOR_REVIEW", "FAILED", "APPLYING"] },
          },
          data: { sourceMetaJson: remainingJson, status: "CANCELLED", cancelledAt: now },
        });
        if (moved.count === 1) {
          cancelledAbandoned.push(row.id);
        } else {
          await prisma.menuImport.updateMany({
            where: { id: row.id, status: { in: ["APPLIED", "CANCELLED"] } },
            data: { sourceMetaJson: remainingJson },
          });
        }
      } else {
        await prisma.menuImport.updateMany({
          where: { id: row.id, status: { in: ["APPLIED", "CANCELLED"] } },
          data: { sourceMetaJson: remainingJson },
        });
      }
      purgedImports.push(row.id);
    } else {
      purgedImports.push(row.id);
      deletedKeys.push(...files.map((file) => file.key));
      if (abandoned) cancelledAbandoned.push(row.id);
    }
  }

  const listed = await storage.listObjects(menuMediaListPrefix());
  const referenced = await referencedImportSourceKeys();
  const orphanedKeys: string[] = [];
  let skippedRecentOrphans = 0;
  for (const object of listed) {
    if (!isManagedMenuImportSourceKey(object.key)) continue;
    if (referenced.has(object.key)) continue;
    if (object.lastModified > orphanCutoff) {
      skippedRecentOrphans += 1;
      continue;
    }
    orphanedKeys.push(object.key);
  }

  const deletedOrphans: string[] = [];
  if (apply) {
    for (const key of orphanedKeys) {
      try {
        await storage.deleteObject(key);
        deletedOrphans.push(key);
        deletedKeys.push(key);
      } catch (error) {
        failedKeys.push(key);
        logError("menu-import", "Menu import orphan source cleanup failed", {
          errorType: error instanceof Error ? error.name : "Error",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    apply,
    listed: rows.length,
    purgedImports,
    deletedKeys,
    failedKeys,
    cancelledAbandoned,
    orphanedKeys,
    deletedOrphans,
    skippedRecentOrphans,
  };
}
