import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canAccessAdminMenu } from "@/lib/staff-permissions";
import { featureDisabledResponse } from "@/lib/feature-guard";
import {
  createReservation,
  listReservations,
  notifyReservationReady,
  updateReservationStatus,
} from "@/lib/reservation-service";
import type { ReservationStatus } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "reservations");
  if (blocked) return blocked;

  const status = req.nextUrl.searchParams.get("status") as ReservationStatus | null;
  const rows = await listReservations(session.restaurantId, status ?? undefined);
  return NextResponse.json({
    reservations: rows.map((r) => ({
      ...r,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      notifiedAt: r.notifiedAt?.toISOString() ?? null,
      seatedAt: r.seatedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "reservations");
  if (blocked) return blocked;

  const body = await req.json();
  const action = String(body.action ?? "create");

  try {
    if (action === "notify") {
      const row = await notifyReservationReady(session.restaurantId, String(body.id));
      return NextResponse.json({ ok: true, reservation: row });
    }

    if (!canAccessAdminMenu(session.role) && session.role !== "SERVER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const row = await createReservation({
      restaurantId: session.restaurantId,
      guestName: String(body.guestName ?? ""),
      guestPhone: String(body.guestPhone ?? ""),
      partySize: body.partySize ? Number(body.partySize) : 2,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      notes: body.notes ? String(body.notes) : undefined,
      status: body.status as ReservationStatus | undefined,
    });
    return NextResponse.json({ ok: true, reservation: row }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reservation failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession(["OWNER", "MANAGER", "SERVER"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "reservations");
  if (blocked) return blocked;

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const row = await updateReservationStatus({
      restaurantId: session.restaurantId,
      id,
      status: body.status as ReservationStatus,
      tableId: body.tableId !== undefined ? body.tableId : undefined,
    });
    return NextResponse.json({ ok: true, reservation: row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 }
    );
  }
}
