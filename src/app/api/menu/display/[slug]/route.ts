import { NextRequest, NextResponse } from "next/server";
import { getRestaurantDisplayMenu } from "@/lib/menu-display-service";
import { rejectIfSlugEscapesHost } from "@/platform/tenant-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const blocked = await rejectIfSlugEscapesHost(req, slug);
  if (blocked) return blocked;
  const menu = await getRestaurantDisplayMenu(slug);
  if (!menu) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  return NextResponse.json(menu, {
    headers: { "Cache-Control": "no-store" },
  });
}
