import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTableOrderUrl } from "@/lib/server-app-url";
import { dineInTablesWhere } from "@/lib/order-channel";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tables = await prisma.table.findMany({
    where: dineInTablesWhere(session.restaurantId),
    orderBy: { number: "asc" },
  });

  const qrCodes = await Promise.all(
    tables.map(async (table) => {
      const url = getTableOrderUrl(session.restaurantSlug, table.qrToken);
      const dataUrl = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });
      return {
        id: table.id,
        number: table.number,
        qrToken: table.qrToken,
        url,
        dataUrl,
        isActive: table.isActive,
      };
    })
  );

  return NextResponse.json({ qrCodes, restaurantName: session.restaurantName });
}

export async function POST(req: Request) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count } = await req.json();
  const existing = await prisma.table.count({
    where: { restaurantId: session.restaurantId },
  });

  const newCount = count || 1;
  const tables = [];

  for (let i = 0; i < newCount; i++) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.restaurantId },
      select: { defaultMaxSessions: true, slug: true },
    });
    const tableNum = existing + i + 1;
    const table = await prisma.table.create({
      data: {
        number: tableNum,
        kind: "DINE_IN",
        qrToken: `${restaurant?.slug ?? "table"}-table-${tableNum}`,
        maxSessions: restaurant?.defaultMaxSessions ?? 2,
        restaurantId: session.restaurantId,
      },
    });
    tables.push(table);
  }

  return NextResponse.json({ tables }, { status: 201 });
}
