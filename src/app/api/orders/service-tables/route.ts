import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureServiceTables } from "@/lib/service-tables";
import { SERVICE_TABLE_DEFS } from "@/lib/order-channel";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET() {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: { slug: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  await ensureServiceTables(session.restaurantId, restaurant.slug);

  const tables = await prisma.table.findMany({
    where: {
      restaurantId: session.restaurantId,
      number: { in: SERVICE_TABLE_DEFS.map((def) => def.number) },
    },
    select: {
      id: true,
      number: true,
      kind: true,
      serviceLabel: true,
    },
    orderBy: { number: "asc" },
  });

  return NextResponse.json({
    serviceTables: tables.map((table) => {
      const def = SERVICE_TABLE_DEFS.find((entry) => entry.number === table.number);
      return {
        ...table,
        channel: def?.channel ?? "DINE_IN",
      };
    }),
  });
}

export const GET = withForensicApiRoute(handleGET);
