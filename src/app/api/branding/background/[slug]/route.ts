import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { getRestaurantFeatureFlags } from "@/lib/feature-flags";
import { findBackgroundImageFile } from "@/lib/background-image-storage";
import { rejectIfSlugEscapesHost } from "@/platform/tenant-scope";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const blocked = await rejectIfSlugEscapesHost(req, slug);
  if (blocked) return blocked;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, backgroundImageUrl: true },
  });

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const flags = await getRestaurantFeatureFlags(restaurant.id);
  if (!flags.custom_background || !restaurant.backgroundImageUrl) {
    return NextResponse.json({ error: "Background not configured" }, { status: 404 });
  }

  const stored = await findBackgroundImageFile(restaurant.id);
  if (!stored) {
    return NextResponse.json({ error: "Background file not found" }, { status: 404 });
  }

  const etag = `"bg-${restaurant.id}-${stored.mtimeMs}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": req.nextUrl.searchParams.has("v")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate",
      },
    });
  }

  const data = await fs.readFile(stored.filePath);

  return new NextResponse(data, {
    headers: {
      "Content-Type": stored.contentType,
      ETag: etag,
      "Cache-Control": req.nextUrl.searchParams.has("v")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate",
    },
  });
}

export const GET = withForensicApiRoute(handleGET);
