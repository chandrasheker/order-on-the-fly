import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canManageMenu } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import {
  getBackgroundImagePublicUrl,
  saveBackgroundImageFile,
  validateBackgroundImageFile,
} from "@/lib/background-image-storage";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const disabled = await featureDisabledResponse(session.restaurantId, "custom_background");
  if (disabled) return disabled;

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
  }

  const validationError = validateBackgroundImageFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    await saveBackgroundImageFile(session.restaurantId, file);

    const backgroundImageUrl = getBackgroundImagePublicUrl(session.restaurantSlug, Date.now());
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
