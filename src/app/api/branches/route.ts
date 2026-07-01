import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listBranches, ensureDefaultBranch } from "@/lib/branch-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branches = await listBranches(session.restaurantId);
  return NextResponse.json({ branches });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? name.toLowerCase().replace(/\s+/g, "-")).trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  await ensureDefaultBranch(session.restaurantId);

  const branch = await prisma.branch.create({
    data: {
      restaurantId: session.restaurantId,
      name,
      slug,
      address: body.address ?? null,
      timezone: body.timezone ?? "Asia/Kolkata",
      isDefault: false,
    },
  });

  return NextResponse.json({ branch }, { status: 201 });
}
