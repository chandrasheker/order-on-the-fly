import { NextRequest, NextResponse } from "next/server";
import { canManageMenu, requireSession } from "@/lib/auth";
import { publicMenuImportConfig } from "@/lib/menu-import/config";
import { MenuImportValidationError } from "@/lib/menu-import/errors";
import { toPublicMenuImport } from "@/lib/menu-import/public";
import { createMenuImportFromUpload, listRestaurantMenuImports } from "@/lib/menu-import/service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await listRestaurantMenuImports(session.restaurantId);
  return NextResponse.json({
    extraction: publicMenuImportConfig(),
    imports: rows.map((row) => toPublicMenuImport(row, { includeDraft: false })),
  });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Unsupported or unreadable menu file" }, { status: 400 });
  }

  const uploaded = [
    ...form.getAll("files"),
    ...form.getAll("file"),
  ].filter((value): value is File => typeof File !== "undefined" && value instanceof File);

  const files = [];
  for (const file of uploaded) {
    const bytes = Buffer.from(await file.arrayBuffer());
    files.push({ originalName: file.name || "menu-file", bytes });
  }

  try {
    const created = await createMenuImportFromUpload({ session, files });
    return NextResponse.json(
      { import: toPublicMenuImport(created, { includeDraft: true }) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof MenuImportValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unsupported or unreadable menu file" }, { status: 400 });
  }
}

export const POST = withForensicApiRoute(handlePOST);
