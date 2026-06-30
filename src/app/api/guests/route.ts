import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessAdminMenu } from "@/lib/staff-permissions";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { listGuestProfiles, lookupGuestByPhone } from "@/lib/guest-crm-service";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canAccessAdminMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "guest_crm");
  if (blocked) return blocked;

  const phone = req.nextUrl.searchParams.get("phone");
  if (phone) {
    const guest = await lookupGuestByPhone(session.restaurantId, phone);
    return NextResponse.json({ guest });
  }

  const guests = await listGuestProfiles(session.restaurantId);
  return NextResponse.json({ guests });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canAccessAdminMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "guest_crm");
  if (blocked) return blocked;

  const { id, notes, name } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const guest = await prisma.guestProfile.findFirst({
    where: { id: String(id), restaurantId: session.restaurantId },
  });
  if (!guest) return NextResponse.json({ error: "Guest not found" }, { status: 404 });

  const updated = await prisma.guestProfile.update({
    where: { id: guest.id },
    data: {
      ...(notes !== undefined && { notes: notes ? String(notes) : null }),
      ...(name !== undefined && { name: name ? String(name) : null }),
    },
  });

  return NextResponse.json({ guest: updated });
}
