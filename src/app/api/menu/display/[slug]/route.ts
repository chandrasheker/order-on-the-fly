import { NextRequest, NextResponse } from "next/server";
import { getRestaurantDisplayMenu } from "@/lib/menu-display-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const menu = await getRestaurantDisplayMenu(slug);
  if (!menu) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  return NextResponse.json(menu, {
    headers: { "Cache-Control": "no-store" },
  });
}
