import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canManageMenu } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { getUploadedImageFile } from "@/lib/image-upload";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import {
  getBackgroundImagePublicUrl,
  saveBackgroundImageFile,
  validateBackgroundImageFile,
  findBackgroundImageFile,
} from "@/lib/background-image-storage";

async function handlePOST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session || !canManageMenu(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const disabled = await featureDisabledResponse(session.restaurantId, "custom_background");
    if (disabled) return disabled;

    const formData = await req.formData();
    const file = getUploadedImageFile(formData);
    if (!file) {
      return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
    }

    const validationError = validateBackgroundImageFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    await saveBackgroundImageFile(session.restaurantId, file);

    const stored = await findBackgroundImageFile(session.restaurantId);
    const version = stored?.mtimeMs ?? Date.now();
    const backgroundImageUrl = getBackgroundImagePublicUrl(session.restaurantSlug, version);
    const updated = await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: { backgroundImageUrl },
      select: { backgroundImageUrl: true },
    });

    return NextResponse.json({
      settings: { backgroundImageUrl: updated.backgroundImageUrl ?? "", enabled: true },
      message: "Guest page background uploaded successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withForensicApiRoute(handlePOST);
