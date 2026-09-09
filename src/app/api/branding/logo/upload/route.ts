import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canManageMenu } from "@/lib/auth";
import { getUploadedImageFile } from "@/lib/image-upload";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import {
  findLogoImageFile,
  getLogoImagePublicUrl,
  saveLogoImageFile,
  validateLogoImageFile,
} from "@/lib/logo-image-storage";

async function handlePOST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session || !canManageMenu(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = getUploadedImageFile(formData);
    if (!file) {
      return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
    }

    const validationError = validateLogoImageFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    await saveLogoImageFile(session.restaurantId, file);

    const stored = await findLogoImageFile(session.restaurantId);
    const version = stored?.mtimeMs ?? Date.now();
    const logoUrl = getLogoImagePublicUrl(session.restaurantSlug, version);
    const updated = await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: { logoUrl },
      select: { logoUrl: true },
    });

    return NextResponse.json({
      settings: { logoUrl: updated.logoUrl ?? "" },
      message: "Restaurant logo uploaded successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withForensicApiRoute(handlePOST);
