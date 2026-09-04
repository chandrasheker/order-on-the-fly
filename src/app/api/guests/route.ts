import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessAdminMenu } from "@/lib/staff-permissions";
import { featureDisabledResponse } from "@/lib/feature-guard";
import { listGuestProfiles, lookupGuestByPhone } from "@/lib/guest-crm-service";
import { prisma } from "@/lib/prisma";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(req: NextRequest) {
  const session = await requireSession();
  if (!session || !canAccessAdminMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "guest_crm");
  if (blocked) return blocked;

  const phone = req.nextUrl.searchParams.get("phone");
  const { tryAppendPlatformAuditEvent } = await import("@/platform/forensics/platform-audit-service");
  const { AUDIT_ACTION, AUDIT_CATEGORY } = await import("@/platform/forensics/constants");
  const { setForensicResource } = await import("@/platform/forensics/request-context");
  if (phone) {
    const guest = await lookupGuestByPhone(session.restaurantId, phone);
    if (guest) {
      setForensicResource({ type: "GuestProfile", id: guest.id, label: "guest" });
    }
    await tryAppendPlatformAuditEvent({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.CUSTOMER_DETAILS_VIEWED,
      resourceType: "GuestProfile",
      resourceId: guest?.id ?? null,
      metadata: { lookup: "phone", found: Boolean(guest) },
    });
    return NextResponse.json({ guest });
  }

  const guests = await listGuestProfiles(session.restaurantId);
  await tryAppendPlatformAuditEvent({
    category: AUDIT_CATEGORY.SECURITY,
    action: AUDIT_ACTION.CUSTOMER_DETAILS_VIEWED,
    resourceType: "GuestProfile",
    metadata: { lookup: "list", count: guests.length },
  });
  return NextResponse.json({ guests });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest) {
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

export const PATCH = withForensicApiRoute(handlePATCH);
