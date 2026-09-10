import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canManageMenu } from "@/lib/auth";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { removeLogoImageFile, resolveLogoImagePublicUrl } from "@/lib/logo-image-storage";

async function handleGET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: { slug: true, logoUrl: true },
  });

  const logoUrl = restaurant
    ? ((await resolveLogoImagePublicUrl({
        id: session.restaurantId,
        slug: restaurant.slug,
        logoUrl: restaurant.logoUrl,
      })) ?? "")
    : "";

  if (restaurant && logoUrl && logoUrl !== (restaurant.logoUrl ?? "")) {
    await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: { logoUrl },
    });
  }

  return NextResponse.json({
    settings: { logoUrl },
  });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (body.logoUrl === null || body.logoUrl === "") {
    await removeLogoImageFile(session.restaurantId);
    await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: { logoUrl: null },
    });
    return NextResponse.json({ settings: { logoUrl: "" } });
  }

  return NextResponse.json({ error: "Use file upload to set the restaurant logo." }, { status: 400 });
}

export const PATCH = withForensicApiRoute(handlePATCH);
