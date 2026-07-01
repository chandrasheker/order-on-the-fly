import { prisma } from "@/lib/prisma";
import type { CartDraftSource } from "@/generated/prisma/client";

const DRAFT_STALE_MS = 45 * 60_000;

export type CartDraftItem = {
  menuItemId: string;
  name: string;
  quantity: number;
};

function parseItems(itemsJson: string): CartDraftItem[] {
  try {
    const parsed = JSON.parse(itemsJson) as CartDraftItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.menuItemId === "string" &&
        typeof item.quantity === "number" &&
        item.quantity > 0,
    );
  } catch {
    return [];
  }
}

export function draftKeyForSession(source: CartDraftSource, sessionKey?: string | null) {
  if (source === "STAFF") return "staff";
  return sessionKey?.trim() || "anonymous";
}

export async function upsertTableCartDraft(params: {
  tableId: string;
  source: CartDraftSource;
  sessionKey?: string | null;
  items: CartDraftItem[];
}) {
  const draftKey = draftKeyForSession(params.source, params.sessionKey);
  const itemsJson = JSON.stringify(
    params.items
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
      })),
  );

  if (itemsJson === "[]") {
    await prisma.tableCartDraft.deleteMany({
      where: { tableId: params.tableId, draftKey, source: params.source },
    });
    return { itemCount: 0 };
  }

  await prisma.tableCartDraft.upsert({
    where: {
      tableId_draftKey_source: {
        tableId: params.tableId,
        draftKey,
        source: params.source,
      },
    },
    create: {
      tableId: params.tableId,
      draftKey,
      source: params.source,
      itemsJson,
    },
    update: { itemsJson },
  });

  return {
    itemCount: parseItems(itemsJson).reduce((sum, item) => sum + item.quantity, 0),
  };
}

export async function clearTableCartDraft(params: {
  tableId: string;
  source?: CartDraftSource;
  sessionKey?: string | null;
}) {
  if (params.source) {
    const draftKey = draftKeyForSession(params.source, params.sessionKey);
    await prisma.tableCartDraft.deleteMany({
      where: { tableId: params.tableId, draftKey, source: params.source },
    });
    return;
  }
  await prisma.tableCartDraft.deleteMany({ where: { tableId: params.tableId } });
}

export async function getTableDraftItemCounts(tableIds: string[]) {
  if (tableIds.length === 0) return new Map<string, number>();

  const cutoff = new Date(Date.now() - DRAFT_STALE_MS);
  const drafts = await prisma.tableCartDraft.findMany({
    where: { tableId: { in: tableIds }, updatedAt: { gte: cutoff } },
    select: { tableId: true, itemsJson: true },
  });

  const counts = new Map<string, number>();
  for (const draft of drafts) {
    const qty = parseItems(draft.itemsJson).reduce((sum, item) => sum + item.quantity, 0);
    if (qty <= 0) continue;
    counts.set(draft.tableId, (counts.get(draft.tableId) ?? 0) + qty);
  }
  return counts;
}
