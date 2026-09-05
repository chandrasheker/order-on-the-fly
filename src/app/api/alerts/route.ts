import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const alerts = await prisma.alert.findMany({
    where: { restaurantId: session.restaurantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ alerts });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { alertIds, markAllRead } = await req.json();

  if (markAllRead) {
    await prisma.alert.updateMany({
      where: { restaurantId: session.restaurantId, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true });
  }

  if (alertIds?.length) {
    await prisma.alert.updateMany({
      where: { id: { in: alertIds }, restaurantId: session.restaurantId },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ success: true });
}

export const PATCH = withForensicApiRoute(handlePATCH);
