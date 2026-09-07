import { NextRequest, NextResponse } from "next/server";
import { canManageMenu, requireSession } from "@/lib/auth";
import { MenuImportValidationError } from "@/lib/menu-import/errors";
import { toPublicMenuImport } from "@/lib/menu-import/public";
import { applyOwnedMenuImport, loadLiveMenuNames } from "@/lib/menu-import/service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handlePOST(req: NextRequest, ctx: { params: Promise<{ importId: string }> }) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { importId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { draft?: unknown } | null;
  try {
    const applied = await applyOwnedMenuImport({
      restaurantId: session.restaurantId,
      importId,
      draft: body?.draft,
    });
    if (!applied?.import) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const liveItems = await loadLiveMenuNames(session.restaurantId);
    return NextResponse.json({
      import: toPublicMenuImport(applied.import, { liveItems }),
      result: applied.result,
    });
  } catch (error) {
    if (error instanceof MenuImportValidationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, status: error.currentStatus },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: "This import cannot be applied." }, { status: 409 });
  }
}

export const POST = withForensicApiRoute(handlePOST);
