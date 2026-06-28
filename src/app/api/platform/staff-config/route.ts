import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requirePlatformAdmin } from "@/lib/auth";
import type { Role } from "@/generated/prisma/client";
import {
  buildSlotKeys,
  defaultEmailForSlot,
  defaultNameForSlot,
  generatePassword,
  slotCountsFromRestaurant,
  type SlotCounts,
  type StaffSlotDraft,
} from "@/lib/staff-slots";
import { roleForSlotKey } from "@/lib/staff-permissions";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";

function parseCounts(body: Record<string, unknown>): SlotCounts | null {
  const owner = Number(body.ownerSlots ?? body.owner);
  const manager = Number(body.managerSlots ?? body.manager);
  const cook = Number(body.cookSlots ?? body.cook);
  const server = Number(body.serverSlots ?? body.server);
  if ([owner, manager, cook, server].some((n) => !Number.isInteger(n) || n < 0)) {
    return null;
  }
  if (owner + manager + cook + server === 0) {
    return null;
  }
  return { owner, manager, cook, server };
}

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurants = await prisma.restaurant.findMany({
    orderBy: { name: "asc" },
    include: {
      users: { orderBy: { slotKey: "asc" } },
    },
  });

  return NextResponse.json({
    restaurants: restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      staffConfigured: r.staffConfigured,
      counts: slotCountsFromRestaurant(r),
      slots: buildSlotKeys(slotCountsFromRestaurant(r)).map((slotKey) => {
        const user = r.users.find((u) => u.slotKey === slotKey);
        const role = roleForSlotKey(slotKey)!;
        return {
          slotKey,
          role,
          userId: user?.id ?? null,
          name: user?.name ?? defaultNameForSlot(slotKey),
          email: user?.email ?? defaultEmailForSlot(r.slug, slotKey),
        };
      }),
    })),
  });
}

export async function POST(req: NextRequest) {
  logApiRequest("platform/staff-config", "POST");
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const restaurantId = String(body.restaurantId ?? "");
    const counts = parseCounts(body);
    const slots = (body.slots ?? []) as StaffSlotDraft[];

    if (!restaurantId || !counts) {
      return NextResponse.json({ error: "Invalid restaurant or slot counts" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const expectedKeys = new Set(buildSlotKeys(counts));
    const slotMap = new Map<string, StaffSlotDraft>();
    for (const slot of slots) {
      if (!expectedKeys.has(slot.slotKey)) continue;
      slotMap.set(slot.slotKey, slot);
    }

    const emails = new Set<string>();
    for (const slot of slotMap.values()) {
      const email = String(slot.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return NextResponse.json(
          { error: `Valid email required for ${slot.slotKey}` },
          { status: 400 }
        );
      }
      if (emails.has(email)) {
        return NextResponse.json({ error: `Duplicate email: ${email}` }, { status: 409 });
      }
      emails.add(email);
    }

    await prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: {
          ownerSlots: counts.owner,
          managerSlots: counts.manager,
          cookSlots: counts.cook,
          serverSlots: counts.server,
          staffConfigured: true,
        },
      });

      const existingUsers = await tx.user.findMany({ where: { restaurantId } });
      const bySlot = new Map(existingUsers.filter((u) => u.slotKey).map((u) => [u.slotKey!, u]));
      const keepIds = new Set<string>();

      for (const slotKey of expectedKeys) {
        const draft = slotMap.get(slotKey);
        const role = roleForSlotKey(slotKey) as Role;
        const name = String(draft?.name ?? defaultNameForSlot(slotKey)).trim();
        const email = String(draft?.email ?? defaultEmailForSlot(restaurant.slug, slotKey))
          .trim()
          .toLowerCase();
        const password = String(draft?.password ?? "").trim() || generatePassword();
        const passwordHash = await hashPassword(password);

        const existing = bySlot.get(slotKey);
        if (existing) {
          const emailTaken = await tx.user.findFirst({
            where: { email, NOT: { id: existing.id } },
          });
          if (emailTaken) {
            throw new Error(`Email already in use: ${email}`);
          }

          await tx.user.update({
            where: { id: existing.id },
            data: {
              name,
              email,
              role,
              slotKey,
              ...(draft?.password?.trim() ? { passwordHash } : {}),
            },
          });
          keepIds.add(existing.id);
        } else {
          const emailTaken = await tx.user.findUnique({ where: { email } });
          if (emailTaken) {
            throw new Error(`Email already in use: ${email}`);
          }

          const created = await tx.user.create({
            data: {
              name,
              email,
              role,
              slotKey,
              passwordHash,
              restaurantId,
            },
          });
          keepIds.add(created.id);
        }
      }

      const toRemove = existingUsers.filter((u) => u.slotKey && !expectedKeys.has(u.slotKey));
      for (const user of toRemove) {
        await tx.user.delete({ where: { id: user.id } });
      }

      const legacyUsers = existingUsers.filter((u) => !u.slotKey);
      for (const user of legacyUsers) {
        if (!keepIds.has(user.id)) {
          await tx.user.delete({ where: { id: user.id } });
        }
      }
    });

    logInfo("platform/staff-config", "Staff slots configured", {
      adminId: admin.id,
      restaurantId,
      counts,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logApiError("platform/staff-config", "POST", error);
    const message = error instanceof Error ? error.message : "Failed to save staff config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
