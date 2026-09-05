import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { enqueueMenuImportProcessing } from "@/lib/menu-import/enqueue";
import { applyMenuImportForRestaurant } from "@/lib/menu-import/apply";
import { createMenuImportSourceKey } from "@/lib/menu-import/keys";
import { parseMenuImportDraft, serializeDraft } from "@/lib/menu-import/draft";
import { MenuImportValidationError } from "@/lib/menu-import/errors";
import { importAuditMetadata } from "@/lib/menu-import/public";
import { validateMenuImportFiles, type IncomingImportFile } from "@/lib/menu-import/validate-source";
import type { MenuImportSourceMeta } from "@/lib/menu-import/types";
import { getMenuMediaStorage } from "@/lib/menu-media/storage";
import { isManagedMenuImportSourceKey } from "@/lib/menu-media/keys";
import { MENU_IMPORT_CANCELLABLE_STATUSES, MENU_IMPORT_MAX_PROCESS_ATTEMPTS } from "@/lib/menu-import/constants";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx } from "@/platform/forensics/platform-audit-service";
import { setForensicResource } from "@/platform/forensics/request-context";

export async function loadLiveMenuNames(restaurantId: string) {
  const items = await prisma.menuItem.findMany({
    where: { category: { restaurantId } },
    select: { name: true, category: { select: { name: true } } },
  });
  return items.map((item) => ({ categoryName: item.category.name, itemName: item.name }));
}

export async function findRestaurantMenuImport(restaurantId: string, importId: string) {
  return prisma.menuImport.findFirst({
    where: { id: importId, restaurantId },
  });
}

export async function listRestaurantMenuImports(restaurantId: string) {
  return prisma.menuImport.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

async function deleteSourceKeys(keys: string[]) {
  const storage = getMenuMediaStorage();
  for (const key of keys) {
    if (!isManagedMenuImportSourceKey(key)) continue;
    await storage.deleteObject(key);
  }
}

export async function createMenuImportFromUpload(params: {
  session: SessionUser;
  files: IncomingImportFile[];
}) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: params.session.restaurantId },
    select: { id: true, tenantId: true },
  });
  if (!restaurant) {
    throw new MenuImportValidationError("NOT_FOUND", "Not found");
  }

  const validated = await validateMenuImportFiles(params.files);
  const created = await prisma.menuImport.create({
    data: {
      tenantId: restaurant.tenantId,
      restaurantId: restaurant.id,
      status: "UPLOADED",
      sourceType: validated.sourceType,
      sourceFileCount: validated.files.length,
      pageCount: validated.pageCount,
      createdByUserId: params.session.id,
      createdByName: params.session.name,
      sourceMetaJson: JSON.stringify({ files: [] }),
    },
  });

  const stored: MenuImportSourceMeta = { files: [] };
  try {
    const storage = getMenuMediaStorage();
    if (validated.sourceType === "PDF") {
      const file = validated.files[0];
      const key = createMenuImportSourceKey({
        tenantId: restaurant.tenantId,
        restaurantId: restaurant.id,
        importId: created.id,
        index: 0,
        contentType: file.contentType,
        originalName: file.originalName,
      });
      await storage.putObject({
        key,
        body: file.bytes,
        contentType: file.contentType,
        cacheControl: "private, no-store",
      });
      stored.files.push({
        key,
        originalName: file.originalName,
        contentType: file.contentType,
        byteLength: file.bytes.length,
        pageNumber: 1,
      });
    } else {
      for (const file of validated.files) {
        const key = createMenuImportSourceKey({
          tenantId: restaurant.tenantId,
          restaurantId: restaurant.id,
          importId: created.id,
          index: file.pageNumber - 1,
          contentType: file.contentType,
          originalName: file.originalName,
        });
        await storage.putObject({
          key,
          body: file.bytes,
          contentType: file.contentType,
          cacheControl: "private, no-store",
        });
        stored.files.push({
          key,
          originalName: file.originalName,
          contentType: file.contentType,
          byteLength: file.bytes.length,
          pageNumber: file.pageNumber,
        });
      }
    }

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.menuImport.update({
        where: { id: created.id },
        data: { sourceMetaJson: JSON.stringify(stored), pageCount: validated.pageCount },
      });
      setForensicResource({ type: "MenuImport", id: row.id, label: "menu-import" });
      await appendPlatformAuditEventInTx(tx, {
        category: AUDIT_CATEGORY.MENU,
        action: AUDIT_ACTION.MENU_IMPORT_CREATED,
        restaurantId: restaurant.id,
        resourceType: "MenuImport",
        resourceId: row.id,
        resourceLabel: "menu-import",
        metadata: importAuditMetadata(row),
      });
      return row;
    });

    await enqueueMenuImportProcessing(saved.id, restaurant.id);
    return saved;
  } catch (error) {
    await deleteSourceKeys(stored.files.map((file) => file.key));
    await prisma.menuImport.delete({ where: { id: created.id } }).catch(() => undefined);
    throw error;
  }
}

export async function saveMenuImportDraft(params: {
  restaurantId: string;
  importId: string;
  draft: unknown;
}) {
  const existing = await findRestaurantMenuImport(params.restaurantId, params.importId);
  if (!existing) return null;
  const draft = parseMenuImportDraft(params.draft);
  const updated = await prisma.menuImport.updateMany({
    where: {
      id: params.importId,
      restaurantId: params.restaurantId,
      status: "READY_FOR_REVIEW",
    },
    data: { draftJson: serializeDraft(draft) },
  });
  if (updated.count !== 1) {
    const current = await findRestaurantMenuImport(params.restaurantId, params.importId);
    throw new MenuImportValidationError("INVALID_STATE", undefined, 409, current?.status);
  }
  return findRestaurantMenuImport(params.restaurantId, params.importId);
}

export async function cancelMenuImport(params: { restaurantId: string; importId: string }) {
  const existing = await findRestaurantMenuImport(params.restaurantId, params.importId);
  if (!existing) return null;
  if (existing.status === "CANCELLED") return existing;

  const outcome = await prisma.$transaction(async (tx) => {
    const claimed = await tx.menuImport.updateMany({
      where: {
        id: params.importId,
        restaurantId: params.restaurantId,
        status: { in: [...MENU_IMPORT_CANCELLABLE_STATUSES] },
      },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    const current = await tx.menuImport.findFirst({
      where: { id: params.importId, restaurantId: params.restaurantId },
    });
    if (claimed.count !== 1) {
      return { cancelled: false as const, current };
    }
    if (current) {
      setForensicResource({ type: "MenuImport", id: current.id, label: "menu-import" });
      await appendPlatformAuditEventInTx(tx, {
        category: AUDIT_CATEGORY.MENU,
        action: AUDIT_ACTION.MENU_IMPORT_CANCELLED,
        restaurantId: params.restaurantId,
        resourceType: "MenuImport",
        resourceId: current.id,
        resourceLabel: "menu-import",
        metadata: importAuditMetadata(current),
      });
    }
    return { cancelled: true as const, current };
  });

  if (outcome.cancelled) return outcome.current;
  if (!outcome.current) return null;
  if (outcome.current.status === "CANCELLED") return outcome.current;
  throw new MenuImportValidationError("INVALID_STATE", undefined, 409, outcome.current.status);
}

export async function retryMenuImportProcessing(params: { restaurantId: string; importId: string }) {
  const row = await findRestaurantMenuImport(params.restaurantId, params.importId);
  if (!row) return null;
  if (row.status === "APPLIED" || row.status === "CANCELLED" || row.status === "READY_FOR_REVIEW") {
    throw new MenuImportValidationError("INVALID_STATE", undefined, 409);
  }
  if (row.status === "PROCESSING") {
    throw new MenuImportValidationError("INVALID_STATE", undefined, 409);
  }
  if (row.processingAttempt >= MENU_IMPORT_MAX_PROCESS_ATTEMPTS) {
    throw new MenuImportValidationError("RETRY_LIMIT", undefined, 409);
  }
  await enqueueMenuImportProcessing(row.id, params.restaurantId);
  return row;
}

export async function applyOwnedMenuImport(params: {
  restaurantId: string;
  importId: string;
  draft?: unknown;
}) {
  const row = await findRestaurantMenuImport(params.restaurantId, params.importId);
  if (!row) return null;
  const result = await applyMenuImportForRestaurant({
    restaurantId: params.restaurantId,
    importId: params.importId,
    draft: params.draft,
  });
  const latest = await findRestaurantMenuImport(params.restaurantId, params.importId);
  return { import: latest, result };
}
