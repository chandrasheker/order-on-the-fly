import { prisma } from "@/lib/prisma";
import { MENU_MEDIA_CLEANUP_GRACE_MS } from "@/lib/menu-media/constants";
import { isManagedMenuMediaKey, menuMediaListPrefix } from "@/lib/menu-media/keys";
import { getMenuMediaStorage } from "@/lib/menu-media/storage";
import { logError } from "@/lib/logger";

export type MenuMediaCleanupResult = {
  apply: boolean;
  graceMs: number;
  listed: number;
  referenced: number;
  skippedRecent: number;
  skippedUnmanaged: number;
  orphans: string[];
  deleted: string[];
  failed: string[];
};

export async function runMenuMediaCleanup(options?: {
  apply?: boolean;
  graceMs?: number;
  now?: Date;
}): Promise<MenuMediaCleanupResult> {
  const apply = Boolean(options?.apply);
  const graceMs = options?.graceMs ?? MENU_MEDIA_CLEANUP_GRACE_MS;
  const now = options?.now ?? new Date();
  const cutoff = new Date(now.getTime() - graceMs);

  const storage = getMenuMediaStorage();
  const listed = await storage.listObjects(menuMediaListPrefix());
  const referencedRows = await prisma.menuItem.findMany({
    where: { imageStorageKey: { not: null } },
    select: { imageStorageKey: true },
  });
  const referenced = new Set(
    referencedRows
      .map((row) => row.imageStorageKey)
      .filter((key): key is string => Boolean(key) && isManagedMenuMediaKey(key)),
  );

  let skippedRecent = 0;
  let skippedUnmanaged = 0;
  const orphans: string[] = [];
  for (const object of listed) {
    if (!isManagedMenuMediaKey(object.key)) {
      skippedUnmanaged += 1;
      continue;
    }
    if (referenced.has(object.key)) continue;
    if (object.lastModified > cutoff) {
      skippedRecent += 1;
      continue;
    }
    orphans.push(object.key);
  }

  const deleted: string[] = [];
  const failed: string[] = [];
  if (apply) {
    for (const key of orphans) {
      try {
        await storage.deleteObject(key);
        deleted.push(key);
      } catch (error) {
        failed.push(key);
        logError("menu-media", "Orphan menu media cleanup failed", {
          key,
          errorType: error instanceof Error ? error.name : "Error",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    apply,
    graceMs,
    listed: listed.length,
    referenced: referenced.size,
    skippedRecent,
    skippedUnmanaged,
    orphans,
    deleted,
    failed,
  };
}
