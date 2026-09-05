import { NextRequest, NextResponse } from "next/server";
import { canManageMenu, requireSession } from "@/lib/auth";
import { MenuImportValidationError } from "@/lib/menu-import/errors";
import { toPublicMenuImport } from "@/lib/menu-import/public";
import { cancelMenuImport } from "@/lib/menu-import/service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handlePOST(_req: NextRequest, ctx: { params: Promise<{ importId: string }> }) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { importId } = await ctx.params;
  try {
    const row = await cancelMenuImport({
      restaurantId: session.restaurantId,
      importId,
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ import: toPublicMenuImport(row) });
  } catch (error) {
    if (error instanceof MenuImportValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export const POST = withForensicApiRoute(handlePOST);
