import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTableOrderUrl } from "@/lib/utils";

export async function GET() {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tables = await prisma.table.findMany({
    where: { restaurantId: session.restaurantId },
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
    const table = await prisma.table.create({
      data: {
        number: existing + i + 1,
        restaurantId: session.restaurantId,
      },
    });
    tables.push(table);
  }

  return NextResponse.json({ tables }, { status: 201 });
}
