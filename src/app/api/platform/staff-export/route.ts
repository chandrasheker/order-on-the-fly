import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireApexPlatformAdmin } from "@/platform/command-center/platform-admin-gate";
import {
  buildSlotKeys,
  defaultEmailForSlot,
  defaultNameForSlot,
  generatePassword,
  slotCountsFromRestaurant,
  slotsToCsv,
} from "@/lib/staff-slots";
import { roleForSlotKey } from "@/lib/staff-permissions";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

function csvHeaders(filename: string) {
  return {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
}

async function handleGET() {
  return NextResponse.json(
    { error: "Use POST /api/platform/staff-export to reset and download new credentials." },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}

async function handlePOST(req: NextRequest) {
  logApiRequest("platform/staff-export", "POST");
  const gate = await requireApexPlatformAdmin(req);
  if (!gate.ok) return gate.response;
  const admin = gate.admin;

  const body = await req.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? req.nextUrl.searchParams.get("restaurantId") ?? "");

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { users: true },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const counts = slotCountsFromRestaurant(restaurant);
    const slotKeys = buildSlotKeys(counts);
    const rows: Array<{
      restaurant: string;
      slotKey: string;
      role: string;
      name: string;
      email: string;
      password: string;
    }> = [];

    for (const slotKey of slotKeys) {
      const user = restaurant.users.find((u) => u.slotKey === slotKey);
      const password = generatePassword();
      const passwordHash = await hashPassword(password);

      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            authVersion: { increment: 1 },
          },
        });
        rows.push({
          restaurant: restaurant.name,
          slotKey,
          role: roleForSlotKey(slotKey) ?? user.role,
          name: user.name,
          email: user.email,
          password,
        });
      } else {
        const role = roleForSlotKey(slotKey)!;
        const email = defaultEmailForSlot(restaurant.slug, slotKey);
        const name = defaultNameForSlot(slotKey);
        await prisma.user.create({
          data: {
            name,
            email,
            role,
            slotKey,
            passwordHash,
            restaurantId: restaurant.id,
          },
        });
        rows.push({
          restaurant: restaurant.name,
          slotKey,
          role,
          name,
          email,
          password,
        });
      }
    }

    const csv = slotsToCsv(rows);
    logInfo("platform/staff-export", "Staff credentials reset and exported", {
      adminId: admin.id,
      restaurantId,
      slotCount: rows.length,
    });

    return new NextResponse(csv, {
      headers: csvHeaders(`${restaurant.slug}-staff-credentials.csv`),
    });
  } catch (error) {
    logApiError("platform/staff-export", "POST", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

export const GET = withForensicApiRoute(handleGET);
export const POST = withForensicApiRoute(handlePOST);
