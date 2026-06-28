import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requirePlatformAdmin } from "@/lib/auth";
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

export async function GET(req: NextRequest) {
  logApiRequest("platform/staff-export", "GET");
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
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
          data: { passwordHash },
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

    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { staffConfigured: true },
    });

    const csv = slotsToCsv(rows);
    logInfo("platform/staff-export", "Staff credentials exported", {
      adminId: admin.id,
      restaurantId,
      slotCount: rows.length,
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${restaurant.slug}-staff-credentials.csv"`,
      },
    });
  } catch (error) {
    logApiError("platform/staff-export", "GET", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
