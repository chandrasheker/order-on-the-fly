import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTableOrderUrl } from "@/lib/server-app-url";
import { dineInTablesWhere, SERVICE_TABLE_NUMBER_FLOOR } from "@/lib/order-channel";
import { ensureDefaultBranch } from "@/lib/branch-service";
import { ensureDefaultFloor } from "@/domains/tables/floor-hierarchy";
import { Prisma } from "@/generated/prisma/client";
import { randomBytes } from "node:crypto";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
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
    }),
  );

  return NextResponse.json({ qrCodes, restaurantName: session.restaurantName });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: Request) {
  const session = await requireSession(["OWNER", "MANAGER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const newCount = Math.max(1, Math.min(10, parseInt(String(body.count ?? 1), 10) || 1));

  const dineIn = await prisma.table.findMany({
    where: dineInTablesWhere(session.restaurantId),
    select: { number: true },
  });
  let nextNumber = dineIn.reduce((max, table) => Math.max(max, table.number), 0) + 1;
  if (nextNumber + newCount - 1 >= SERVICE_TABLE_NUMBER_FLOOR) {
    return NextResponse.json({ error: "Table limit reached" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: { defaultMaxSessions: true, slug: true, tenantId: true },
  });
  const branch = await ensureDefaultBranch(session.restaurantId);
  const floor = await ensureDefaultFloor(branch.id, session.restaurantId);

  const tables = [];
  for (let i = 0; i < newCount; i += 1) {
    const tableNum = nextNumber + i;
    const tokenBase = `${restaurant?.slug ?? "table"}-table-${tableNum}`;
    try {
      tables.push(
        await prisma.table.create({
          data: {
            number: tableNum,
            kind: "DINE_IN",
            qrToken: tokenBase,
            maxSessions: restaurant?.defaultMaxSessions ?? 2,
            restaurantId: session.restaurantId,
            tenantId: restaurant?.tenantId ?? null,
            branchId: branch.id,
            floorId: floor.id,
            orderingEnabled: false,
          },
        }),
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      tables.push(
        await prisma.table.create({
          data: {
            number: tableNum,
            kind: "DINE_IN",
            qrToken: `${tokenBase}-${randomBytes(3).toString("hex")}`,
            maxSessions: restaurant?.defaultMaxSessions ?? 2,
            restaurantId: session.restaurantId,
            tenantId: restaurant?.tenantId ?? null,
            branchId: branch.id,
            floorId: floor.id,
            orderingEnabled: false,
          },
        }),
      );
    }
  }

  return NextResponse.json({ tables }, { status: 201 });
}

export const POST = withForensicApiRoute(handlePOST);
