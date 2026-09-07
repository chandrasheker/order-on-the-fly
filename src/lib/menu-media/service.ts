import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { canManageMenu, type SessionUser } from "@/lib/auth";
import { MENU_MEDIA_CONTENT_TYPE } from "@/lib/menu-media/constants";
import {
  createMenuMediaStorageKey,
  isManagedMenuMediaKey,
  omitMenuItemStorageKey,
  publicMenuMediaUrl,
} from "@/lib/menu-media/keys";
import { MenuMediaValidationError, processMenuItemImage } from "@/lib/menu-media/process-image";
import { getMenuMediaStorage } from "@/lib/menu-media/storage";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx } from "@/platform/forensics/platform-audit-service";
import { setForensicResource } from "@/platform/forensics/request-context";

class MenuMediaCommitError extends Error {
  constructor(message = "Item not found") {
    super(message);
    this.name = "MenuMediaCommitError";
  }
}

export function menuMediaAuditState(item: { id: string; imageRevision: number; imageStorageKey?: string | null }) {
  return {
    menuItemId: item.id,
    hasImage: Boolean(item.imageStorageKey),
    imageRevision: item.imageRevision,
  };
}

export async function findOwnedMenuItem(restaurantId: string, itemId: string) {
  return prisma.menuItem.findFirst({
    where: { id: itemId, category: { restaurantId } },
    include: {
      category: {
        select: {
          restaurantId: true,
          restaurant: { select: { id: true, tenantId: true } },
        },
      },
    },
  });
}

export async function authorizeMenuItemImageMutation(session: SessionUser | null, itemId: string) {
  if (!session || !canManageMenu(session.role)) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }
  const item = await findOwnedMenuItem(session.restaurantId, itemId);
  if (!item) {
    return { ok: false as const, status: 404 as const, error: "Item not found" };
  }
  return { ok: true as const, session, item };
}

export async function deleteManagedMenuMediaBestEffort(key: string | null | undefined) {
  if (!key) return;
  if (!isManagedMenuMediaKey(key)) {
    logWarn("menu-media", "Refused to delete unmanaged storage key");
    return;
  }
  try {
    await getMenuMediaStorage().deleteObject(key);
  } catch (error) {
    logError("menu-media", "Failed to delete managed menu media object", {
      key,
      errorType: error instanceof Error ? error.name : "Error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function uploadMenuItemImage(params: {
  restaurantId: string;
  itemId: string;
  bytes: Buffer;
}) {
  let processed;
  try {
    processed = await processMenuItemImage(params.bytes);
  } catch (error) {
    if (error instanceof MenuMediaValidationError) {
      return { ok: false as const, status: error.status, error: error.message };
    }
    throw error;
  }

  const existing = await findOwnedMenuItem(params.restaurantId, params.itemId);
  if (!existing) {
    return { ok: false as const, status: 404 as const, error: "Item not found" };
  }

  const newKey = createMenuMediaStorageKey({
    tenantId: existing.category.restaurant.tenantId,
    restaurantId: existing.category.restaurant.id,
    menuItemId: existing.id,
  });
  const previousKey = existing.imageStorageKey;
  const hadImage = Boolean(existing.imageStorageKey || existing.imageUrl);
  const action = hadImage ? AUDIT_ACTION.MENU_ITEM_IMAGE_REPLACED : AUDIT_ACTION.MENU_ITEM_IMAGE_UPLOADED;

  await getMenuMediaStorage().putObject({
    key: newKey,
    body: processed.bytes,
    contentType: MENU_MEDIA_CONTENT_TYPE,
  });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.menuItem.findFirst({
        where: { id: params.itemId, category: { restaurantId: params.restaurantId } },
      });
      if (!current) {
        throw new MenuMediaCommitError();
      }
      const imageRevision = current.imageRevision + 1;
      const next = await tx.menuItem.update({
        where: { id: current.id },
        data: {
          imageStorageKey: newKey,
          imageUrl: publicMenuMediaUrl(current.id, imageRevision),
          imageRevision,
        },
      });
      setForensicResource({ type: "MenuItem", id: next.id, label: next.name });
      const state = menuMediaAuditState(next);
      await appendPlatformAuditEventInTx(tx, {
        category: AUDIT_CATEGORY.MENU,
        action,
        restaurantId: params.restaurantId,
        resourceType: "MenuItem",
        resourceId: next.id,
        resourceLabel: next.name,
        after: state,
        metadata: state,
      });
      return next;
    });

    if (previousKey && previousKey !== newKey) {
      await deleteManagedMenuMediaBestEffort(previousKey);
    }
    return {
      ok: true as const,
      action: hadImage ? ("replaced" as const) : ("uploaded" as const),
      item: omitMenuItemStorageKey(updated),
    };
  } catch (error) {
    await deleteManagedMenuMediaBestEffort(newKey);
    if (error instanceof MenuMediaCommitError) {
      return { ok: false as const, status: 404 as const, error: "Item not found" };
    }
    throw error;
  }
}

export async function removeMenuItemImage(params: { restaurantId: string; itemId: string }) {
  const existing = await findOwnedMenuItem(params.restaurantId, params.itemId);
  if (!existing) {
    return { ok: false as const, status: 404 as const, error: "Item not found" };
  }
  if (!existing.imageStorageKey && !existing.imageUrl) {
    return { ok: true as const, noop: true as const, item: omitMenuItemStorageKey(existing) };
  }

  const previousKey = existing.imageStorageKey;
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.menuItem.findFirst({
      where: { id: params.itemId, category: { restaurantId: params.restaurantId } },
    });
    if (!current) {
      throw new MenuMediaCommitError();
    }
    if (!current.imageStorageKey && !current.imageUrl) {
      return current;
    }
    const imageRevision = current.imageRevision + 1;
    const next = await tx.menuItem.update({
      where: { id: current.id },
      data: {
        imageStorageKey: null,
        imageUrl: null,
        imageRevision,
      },
    });
    setForensicResource({ type: "MenuItem", id: next.id, label: next.name });
    const state = menuMediaAuditState(next);
    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.MENU,
      action: AUDIT_ACTION.MENU_ITEM_IMAGE_REMOVED,
      restaurantId: params.restaurantId,
      resourceType: "MenuItem",
      resourceId: next.id,
      resourceLabel: next.name,
      after: state,
      metadata: state,
    });
    return next;
  });

  await deleteManagedMenuMediaBestEffort(previousKey);
  return { ok: true as const, noop: false as const, item: omitMenuItemStorageKey(updated) };
}

export async function loadPublicMenuItemImage(params: {
  itemId: string;
  restaurantId: string | null;
  requireRestaurant: boolean;
}) {
  if (params.requireRestaurant && !params.restaurantId) return null;
  const item = await prisma.menuItem.findFirst({
    where: params.restaurantId
      ? { id: params.itemId, category: { restaurantId: params.restaurantId } }
      : { id: params.itemId },
    select: { imageStorageKey: true },
  });
  if (!item?.imageStorageKey || !isManagedMenuMediaKey(item.imageStorageKey)) {
    return null;
  }
  return getMenuMediaStorage().getObject(item.imageStorageKey);
}
