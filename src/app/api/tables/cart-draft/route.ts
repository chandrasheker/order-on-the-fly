import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertCustomerDiningAccess } from "@/lib/customer-dining-guard";
import {
  upsertTableCartDraft,
  clearTableCartDraft,
  type CartDraftItem,
} from "@/lib/table-cart-draft-service";
import type { CartDraftSource } from "@/generated/prisma/client";

function parseItems(raw: unknown): CartDraftItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const menuItemId = String(row.menuItemId ?? "");
      const name = String(row.name ?? "Item");
      const quantity = Number(row.quantity ?? 0);
      if (!menuItemId || quantity <= 0) return null;
      return { menuItemId, name, quantity };
    })
    .filter((item): item is CartDraftItem => item !== null);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { tableToken, tableId, sessionKey, source, items } = body as {
    tableToken?: string;
    tableId?: string;
    sessionKey?: string;
    source?: CartDraftSource;
    items?: unknown;
  };

  const draftSource = source === "STAFF" ? "STAFF" : "CUSTOMER";
  const parsedItems = parseItems(items);

  if (draftSource === "CUSTOMER") {
    if (!tableToken || !sessionKey) {
      return NextResponse.json({ error: "Table token and session required" }, { status: 400 });
    }
    const dining = await assertCustomerDiningAccess(req, tableToken, sessionKey);
    if (!dining.ok) {
      return NextResponse.json({ error: dining.error, code: dining.code }, { status: dining.status });
    }
    const result = await upsertTableCartDraft({
      tableId: dining.table.id,
      source: "CUSTOMER",
      sessionKey,
      items: parsedItems,
    });
    return NextResponse.json(result);
  }

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!tableId) {
    return NextResponse.json({ error: "Table id required" }, { status: 400 });
  }

  const table = await prisma.table.findFirst({
    where: { id: tableId, restaurantId: session.restaurantId, isActive: true },
  });
  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const result = await upsertTableCartDraft({
    tableId,
    source: "STAFF",
    items: parsedItems,
  });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { tableToken, tableId, sessionKey, source } = body as {
    tableToken?: string;
    tableId?: string;
    sessionKey?: string;
    source?: CartDraftSource;
  };

  const draftSource = source === "STAFF" ? "STAFF" : "CUSTOMER";

  if (draftSource === "CUSTOMER") {
    if (!tableToken || !sessionKey) {
      return NextResponse.json({ error: "Table token and session required" }, { status: 400 });
    }
    const dining = await assertCustomerDiningAccess(req, tableToken, sessionKey);
    if (!dining.ok) {
      return NextResponse.json({ error: dining.error, code: dining.code }, { status: dining.status });
    }
    await clearTableCartDraft({
      tableId: dining.table.id,
      source: "CUSTOMER",
      sessionKey,
    });
    return NextResponse.json({ success: true });
  }

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!tableId) {
    return NextResponse.json({ error: "Table id required" }, { status: 400 });
  }

  const table = await prisma.table.findFirst({
    where: { id: tableId, restaurantId: session.restaurantId },
  });
  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  await clearTableCartDraft({ tableId, source: "STAFF" });
  return NextResponse.json({ success: true });
}
