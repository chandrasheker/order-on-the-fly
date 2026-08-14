import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canManageMenu } from "@/lib/auth";
import { getRestaurantFeatureFlags } from "@/lib/feature-flags";
import { featureDisabledResponse } from "@/lib/feature-guard";
import {
  removeBackgroundImageFile,
  resolveBackgroundImagePublicUrl,
} from "@/lib/background-image-storage";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [flags, restaurant] = await Promise.all([
    getRestaurantFeatureFlags(session.restaurantId),
    prisma.restaurant.findUnique({
      where: { id: session.restaurantId },
      select: { slug: true, backgroundImageUrl: true },
    }),
  ]);

  const enabled = flags.custom_background;
  let backgroundImageUrl =
    enabled && restaurant
      ? (await resolveBackgroundImagePublicUrl({
          id: session.restaurantId,
          slug: restaurant.slug,
          backgroundImageUrl: restaurant.backgroundImageUrl,
        })) ?? ""
      : "";

  if (
    enabled &&
    restaurant &&
    backgroundImageUrl &&
    backgroundImageUrl !== (restaurant.backgroundImageUrl ?? "")
  ) {
    await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: { backgroundImageUrl },
    });
  }

  return NextResponse.json({
    settings: {
      backgroundImageUrl,
      enabled,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const disabled = await featureDisabledResponse(session.restaurantId, "custom_background");
  if (disabled) return disabled;

  const body = await req.json();

  if (body.backgroundImageUrl === null || body.backgroundImageUrl === "") {
    await removeBackgroundImageFile(session.restaurantId);
    await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: { backgroundImageUrl: null },
    });
    return NextResponse.json({ settings: { backgroundImageUrl: "", enabled: true } });
  }

  return NextResponse.json({ error: "Use file upload to set the guest background." }, { status: 400 });
}
