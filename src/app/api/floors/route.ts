import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listFloors, ensureDefaultFloor } from "@/domains/tables/floor-hierarchy";
import { prisma } from "@/lib/prisma";
import { tenantContextFromSession } from "@/platform/tenant-context";

export async function GET(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = req.nextUrl.searchParams.get("branchId") ?? undefined;
  const floors = await listFloors(session.restaurantId, branchId);
  const ctx = await tenantContextFromSession(session, { branchId });

  return NextResponse.json({ hierarchy: ctx, floors });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const branchId = String(body.branchId ?? "");
  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? name.toLowerCase().replace(/\s+/g, "-")).trim();
  if (!branchId || !name) {
    return NextResponse.json({ error: "branchId and name required" }, { status: 400 });
  }

  const ctx = await tenantContextFromSession(session, { branchId });
  const floor = await prisma.floor.create({
    data: {
      branchId,
      restaurantId: session.restaurantId,
      tenantId: ctx.tenantId,
      name,
      slug,
      sortOrder: Number(body.sortOrder ?? 0),
    },
  });

  return NextResponse.json({ floor }, { status: 201 });
}
