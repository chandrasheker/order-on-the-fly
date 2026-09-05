import { NextRequest, NextResponse } from "next/server";
import { canManageMenu, requireSession } from "@/lib/auth";
import { MenuImportValidationError } from "@/lib/menu-import/errors";
import { toPublicMenuImport } from "@/lib/menu-import/public";
import {
  findRestaurantMenuImport,
  loadLiveMenuNames,
  saveMenuImportDraft,
} from "@/lib/menu-import/service";
import { publicMenuImportConfig } from "@/lib/menu-import/config";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(_req: NextRequest, ctx: { params: Promise<{ importId: string }> }) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { importId } = await ctx.params;
  const row = await findRestaurantMenuImport(session.restaurantId, importId);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const liveItems = await loadLiveMenuNames(session.restaurantId);
  return NextResponse.json({
    extraction: publicMenuImportConfig(),
    import: toPublicMenuImport(row, { liveItems }),
  });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest, ctx: { params: Promise<{ importId: string }> }) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { importId } = await ctx.params;
  const body = await req.json().catch(() => null);
  try {
    const updated = await saveMenuImportDraft({
      restaurantId: session.restaurantId,
      importId,
      draft: body?.draft ?? body,
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const liveItems = await loadLiveMenuNames(session.restaurantId);
    return NextResponse.json({ import: toPublicMenuImport(updated, { liveItems }) });
  } catch (error) {
    if (error instanceof MenuImportValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Invalid import draft" }, { status: 400 });
  }
}

export const PATCH = withForensicApiRoute(handlePATCH);
